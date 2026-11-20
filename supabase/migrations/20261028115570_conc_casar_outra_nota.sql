-- CONC-DESCONCILIAR-EDSON-01 · fatia 3 (FILA 18/11 13:10 + 13:12, Gabriel 13:07, NJ): NF paga A MAIS porque o mesmo pagamento levou OUTRA
-- nota do fornecedor que ainda não está no sistema. Caso: BB 20/10 PIX −3.404,16 = NF-e 585 (peças, 1.404,00) + NFS-e 270 e 272 (serviços,
-- juntas 2.000,16 — o Lucro Rural diz "NF DE PEÇAS + NF DE SERVIÇOS 585/270/272"). Não é juros nem taxa.
--   · 3º gesto do "a mais": destino 'outra_nota' (+ `outras_notas` opcional no item: [{numero, valor?}]). A NF casa inteira e a diferença
--     nasce REALIZADA no MESMO extrato, mesmo fornecedor: "Falta nota nº 270, 272 · <fornecedor> · pago <data>", na conta padrão do fornecedor
--     (sem ela, "a classificar" = sem conta). Com o valor de cada nota → uma linha por nota (a soma tem de fechar a diferença); sem valor →
--     uma linha só com os números; nota com valor + nota sem valor → as sem valor ficam com o resto, numa linha.
--   · PENDÊNCIA "anexar a nota" (R5): a linha sem documento anexado aparece em `fn_conc_outras_notas_pendentes` (cliente) com o fornecedor
--     e os números — a NFS-e não vem pela Receita; quem a casa é a Caixa de entrada (mesmo fornecedor + nº). Anexou = sai da lista.
--   · o desfazer cancela as linhas junto (R3), como juros/taxa/desconto; o guardar-antes as pula
--   · R2 NA TELA (13:10 (2)): com NF e diferença, a pergunta "Este mês veio … Ligar com o valor do extrato?" (CONC-VALOR-CERTO) NÃO sai mais —
--     só a pergunta da NF resolve a diferença. Sem NF segue como hoje.
-- Os blocos de 115550 (guardar-antes, gatilho do desfazer) são copiados do arquivo 115550 e só mudam onde a outra nota entra; o Casar muda
-- por patch guardado por md5.

ALTER TABLE public.financeiro_baixas_no_vinculo DROP CONSTRAINT financeiro_baixas_no_vinculo_tipo_check;
ALTER TABLE public.financeiro_baixas_no_vinculo ADD CONSTRAINT financeiro_baixas_no_vinculo_tipo_check
  CHECK (tipo = ANY (ARRAY['divisao'::text, 'juncao'::text, 'baixa'::text, 'valor_real'::text, 'casar'::text, 'juros'::text, 'desconto'::text, 'taxa'::text,
                           'outra_nota'::text]));

-- (1) as notas que faltam → as linhas: {ok, linhas:[{valor, numeros[]}]} ou {ok:false, frase}
CREATE OR REPLACE FUNCTION public._fn_conc_outras_notas(p_dif numeric, p_notas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_dif numeric := round(abs(coalesce(p_dif, 0)), 2); e jsonb; v_nums text[]; v_val numeric;
  v_linhas jsonb := '[]'::jsonb; v_soltos text[] := '{}'; v_soma numeric := 0; v_tem_solto boolean := false; v_resto numeric;
BEGIN
  IF v_dif <= 0 THEN RETURN jsonb_build_object('ok', false, 'frase', 'Não há diferença para outra nota.'); END IF;
  IF p_notas IS NULL OR jsonb_typeof(p_notas) <> 'array' OR jsonb_array_length(p_notas) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'linhas', jsonb_build_array(jsonb_build_object('valor', v_dif, 'numeros', '[]'::jsonb)));
  END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p_notas) LOOP
    -- "270, 272" num campo só = dois números
    v_nums := ARRAY(SELECT btrim(n) FROM regexp_split_to_table(coalesce(e->>'numero', ''), '\s*[,;/]\s*|\s+e\s+') AS n WHERE btrim(n) <> '');
    v_val := CASE WHEN jsonb_typeof(e->'valor') = 'number' THEN round((e->>'valor')::numeric, 2) END;
    IF v_val IS NOT NULL AND v_val <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'frase', 'O valor de cada nota tem de ser maior que zero (ou deixe em branco).');
    END IF;
    IF v_val IS NULL THEN
      v_soltos := v_soltos || v_nums; v_tem_solto := true;
    ELSE
      v_soma := v_soma + v_val;
      v_linhas := v_linhas || jsonb_build_array(jsonb_build_object('valor', v_val, 'numeros', to_jsonb(v_nums)));
    END IF;
  END LOOP;
  IF v_tem_solto THEN
    v_resto := v_dif - v_soma;
    IF v_resto <= 0.005 THEN
      RETURN jsonb_build_object('ok', false, 'frase', format('As notas com valor já somam %s e a diferença é %s: a nota sem valor ficaria sem nada.',
                                                            public._fn_oc_brl(v_soma), public._fn_oc_brl(v_dif)));
    END IF;
    v_linhas := v_linhas || jsonb_build_array(jsonb_build_object('valor', round(v_resto, 2), 'numeros', to_jsonb(v_soltos)));
  ELSIF abs(v_soma - v_dif) > 0.005 THEN
    RETURN jsonb_build_object('ok', false, 'frase', format('As notas somam %s e a diferença é %s. Acerte os valores ou deixe em branco o de uma delas.',
                                                          public._fn_oc_brl(v_soma), public._fn_oc_brl(v_dif)));
  END IF;
  RETURN jsonb_build_object('ok', true, 'linhas', v_linhas);
END;
$function$;

-- (2) a linha da outra nota: realizada, mesmo extrato/data/fornecedor; conta = a padrão do fornecedor (sem ela, a classificar)
CREATE OR REPLACE FUNCTION public._fn_conc_outra_nota_linha(p_nf uuid, p_valor numeric, p_data date, p_extrato_id uuid, p_numeros text[], p_motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE l public.financeiro_lancamentos_v2; v_plano uuid; v_novo uuid; v_uid uuid := auth.uid(); v_nro text; v_conta uuid; v_forn text;
  v_valor numeric := round(abs(coalesce(p_valor, 0)), 2); v_nums text := nullif(array_to_string(coalesce(p_numeros, '{}'), ', '), '');
BEGIN
  IF v_valor <= 0 THEN
    RAISE EXCEPTION 'Outra nota: valor inválido (%). Nada foi gravado.', coalesce(p_valor::text, '-') USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_nf;
  IF NOT FOUND OR l.cancelado IS TRUE OR l.tipo_operacao NOT LIKE '2-%' THEN
    RAISE EXCEPTION 'A linha da outra nota só nasce de uma nota de saída viva. Nada foi gravado.' USING ERRCODE = 'P0001', DETAIL = p_nf::text;
  END IF;
  SELECT f.nome, (SELECT pc.id FROM public.financeiro_plano_contas pc
                   WHERE pc.id = f.plano_padrao_id AND pc.ativo AND pc.tipo_operacao LIKE '2-%' AND (pc.cliente_id IS NULL OR pc.cliente_id = l.cliente_id))
    INTO v_forn, v_plano
    FROM public.financeiro_fornecedores f WHERE f.id = l.favorecido_id;
  v_nro := coalesce(nullif(btrim(l.numero_documento), ''),
                    (SELECT nullif(btrim(d.numero), '') FROM public.vw_lancamento_documentos d
                      WHERE d.lancamento_id = l.id AND d.cancelado IS NOT TRUE AND d.especie LIKE 'nf%' AND nullif(btrim(d.numero), '') IS NOT NULL
                      ORDER BY d.uploaded_em NULLS LAST LIMIT 1),
                    's/nº');
  v_conta := coalesce(l.conta_bancaria_id, (SELECT e.conta_bancaria_id FROM public.extrato_bancario_v2 e WHERE e.id = p_extrato_id));
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, ano_mes, valor, tipo_operacao, sinal, descricao, status_transacao,
      data_pagamento, conta_bancaria_id, data_competencia, data_vencimento, plano_conta_id, favorecido_id, cenario,
      origem_lancamento, origem_tipo, numero_documento, sem_movimentacao_caixa, forma_pagamento, observacao, created_by, updated_by)
  VALUES (l.cliente_id, l.fazenda_id, to_char(p_data, 'YYYY-MM'), v_valor, l.tipo_operacao, '-1',
          format('Falta nota%s · %s · pago %s', CASE WHEN v_nums IS NULL THEN '' ELSE ' nº ' || v_nums END,
                 coalesce(nullif(btrim(v_forn), ''), 'sem fornecedor'), public._fn_oc_data(p_data)),
          'realizado', p_data, v_conta, p_data, p_data, v_plano, l.favorecido_id, coalesce(l.cenario, 'realizado'),
          'conciliacao', 'conc:outra_nota', v_nums, false, l.forma_pagamento,
          format('Outra nota (falta lançar) de %s%s, paga junto com a NF nº %s (lançamento %s) no extrato de %s. Pendência: anexar a nota.',
                 public._fn_oc_brl(v_valor), CASE WHEN v_nums IS NULL THEN '' ELSE ' — nº ' || v_nums END, v_nro, l.id, public._fn_oc_data(p_data)),
          v_uid, v_uid)
  RETURNING id INTO v_novo;
  INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, irmao_id, valor_original, valor_aplicado, antes, depois,
      origem, motivo, feita_por)
  VALUES (l.cliente_id, 'outra_nota', l.id, v_novo, l.valor, v_valor, '{}'::jsonb,
          jsonb_build_object('linha_id', v_novo, 'extrato_id', p_extrato_id, 'data', p_data, 'plano_conta_id', v_plano,
                             'numeros', to_jsonb(coalesce(p_numeros, '{}'))),
          'conserto', coalesce(nullif(btrim(p_motivo), ''), 'outra nota (falta lançar)'), v_uid);
  RETURN v_novo;
END;
$function$;

-- (3) o guardar-antes pula a linha da outra nota
CREATE OR REPLACE FUNCTION public._fn_conc_guardar_antes(p_lancamento_id uuid, p_extrato_id uuid, p_origem text DEFAULT 'conserto')
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE l public.financeiro_lancamentos_v2;
BEGIN
  -- o motor de blocos guarda o dele (conciliacao_blocos.estado_anterior) e o devolve pelo fn_desfazer_bloco
  IF coalesce(current_setting('app.conciliar_bloco', true), 'off') = 'on' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_baixas_no_vinculo b
              WHERE b.lancamento_id = p_lancamento_id AND b.tipo = 'casar' AND b.desfeita_em IS NULL) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.lancamento_id = p_lancamento_id AND c.desfeito_em IS NULL) THEN RETURN; END IF;
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  -- a linha que o próprio casar criou (juros, desconto) sai com o desfazer da NF: não tem antes
  IF NOT FOUND OR l.cancelado IS TRUE OR coalesce(l.origem_tipo, '') IN ('conc:juros', 'conc:desconto', 'conc:taxa', 'conc:outra_nota') THEN RETURN; END IF;
  INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, valor_original, antes, depois, origem, motivo, feita_por)
  VALUES (l.cliente_id, 'casar', l.id, l.valor, public._fn_conc_estado_do_lancamento(l.id) || jsonb_build_object('extrato_id', p_extrato_id),
          '{}'::jsonb, CASE WHEN p_origem = 'gatilho' THEN 'gatilho' ELSE 'conserto' END, 'antes do casar', auth.uid());
END;
$function$;

-- (4) o desfazer cancela a linha da outra nota junto
CREATE OR REPLACE FUNCTION public._fn_trg_conc_voltar_ao_desfazer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE b public.financeiro_baixas_no_vinculo; x public.financeiro_baixas_no_vinculo; l public.financeiro_lancamentos_v2;
  v_uid uuid := auth.uid(); v_agora jsonb; v_set jsonb := '{}'::jsonb; v_mantidos text[] := '{}'; f text; v_a text; v_b text; v_igual boolean;
  v_motivo text := coalesce(nullif(btrim(NEW.desfeito_motivo), ''), 'vínculo desfeito');
BEGIN
  IF EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.lancamento_id = NEW.lancamento_id AND c.desfeito_em IS NULL) THEN
    RETURN NULL;
  END IF;
  -- (a) as linhas que o casar CRIOU para a NF saem (canceladas com o motivo; a casa não apaga)
  FOR x IN SELECT * FROM public.financeiro_baixas_no_vinculo
            WHERE lancamento_id = NEW.lancamento_id AND tipo IN ('juros', 'desconto', 'taxa', 'outra_nota') AND desfeita_em IS NULL FOR UPDATE LOOP
    PERFORM set_config('app.conc_dividindo', 'on', true);
    UPDATE public.financeiro_lancamentos_v2
       SET cancelado = true, cancelado_em = now(), cancelado_por = v_uid,
           cancelado_motivo = format('%s da NF desfeito junto com o casar (%s).', CASE x.tipo WHEN 'juros' THEN 'Juros/multa' WHEN 'taxa' THEN 'Taxa (sem nota)' WHEN 'outra_nota' THEN 'Outra nota (falta lançar)' ELSE 'Desconto obtido' END, v_motivo),
           updated_at = now(), updated_by = coalesce(v_uid, updated_by)
     WHERE id = x.irmao_id AND cancelado IS NOT TRUE;
    PERFORM set_config('app.conc_dividindo', 'off', true);
    UPDATE public.financeiro_baixas_no_vinculo SET desfeita_em = now(), desfeita_por = v_uid, desfeita_motivo = v_motivo WHERE id = x.id;
  END LOOP;
  -- (b) o ANTES do casar volta. D4-a (i): o campo que não está mais com o valor que o casar pôs (editado depois) fica com a edição.
  SELECT * INTO b FROM public.financeiro_baixas_no_vinculo
   WHERE lancamento_id = NEW.lancamento_id AND tipo = 'casar' AND desfeita_em IS NULL ORDER BY feita_em DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = NEW.lancamento_id FOR UPDATE;
  IF l.cancelado IS NOT TRUE THEN
    v_agora := public._fn_conc_estado_do_lancamento(l.id);
    FOREACH f IN ARRAY ARRAY['valor', 'status_transacao', 'data_pagamento', 'plano_conta_id', 'conta_bancaria_id', 'conta_destino_id', 'conciliado_em'] LOOP
      v_a := v_agora->>f; v_b := b.antes->>f;
      v_igual := CASE f WHEN 'valor' THEN v_a::numeric IS NOT DISTINCT FROM v_b::numeric
                        WHEN 'conciliado_em' THEN v_a::timestamptz IS NOT DISTINCT FROM v_b::timestamptz
                        ELSE v_a IS NOT DISTINCT FROM v_b END;
      CONTINUE WHEN v_igual;
      v_b := b.depois->>f;
      IF b.depois = '{}'::jsonb
         OR (CASE f WHEN 'valor' THEN v_a::numeric IS NOT DISTINCT FROM v_b::numeric
                    WHEN 'conciliado_em' THEN v_a::timestamptz IS NOT DISTINCT FROM v_b::timestamptz
                    ELSE v_a IS NOT DISTINCT FROM v_b END) THEN
        v_set := v_set || jsonb_build_object(f, b.antes->f);
      ELSE
        v_mantidos := v_mantidos || f;
      END IF;
    END LOOP;
    -- só realizado tem data de pagamento: o status que volta para aberto leva a data de antes junto
    IF v_set ? 'status_transacao' AND v_set->>'status_transacao' NOT IN ('realizado', 'conciliado') THEN
      v_set := v_set || jsonb_build_object('data_pagamento', b.antes->'data_pagamento');
      v_mantidos := array_remove(v_mantidos, 'data_pagamento');
    END IF;
    IF v_set <> '{}'::jsonb THEN
      PERFORM set_config('app.conc_dividindo', 'on', true);
      UPDATE public.financeiro_lancamentos_v2 t
         SET valor             = CASE WHEN v_set ? 'valor' THEN (v_set->>'valor')::numeric ELSE t.valor END,
             status_transacao  = CASE WHEN v_set ? 'status_transacao' THEN v_set->>'status_transacao' ELSE t.status_transacao END,
             data_pagamento    = CASE WHEN v_set ? 'data_pagamento' THEN (v_set->>'data_pagamento')::date ELSE t.data_pagamento END,
             plano_conta_id    = CASE WHEN v_set ? 'plano_conta_id' THEN (v_set->>'plano_conta_id')::uuid ELSE t.plano_conta_id END,
             conta_bancaria_id = CASE WHEN v_set ? 'conta_bancaria_id' THEN (v_set->>'conta_bancaria_id')::uuid ELSE t.conta_bancaria_id END,
             conta_destino_id  = CASE WHEN v_set ? 'conta_destino_id' THEN (v_set->>'conta_destino_id')::uuid ELSE t.conta_destino_id END,
             conciliado_em     = CASE WHEN v_set ? 'conciliado_em' THEN (v_set->>'conciliado_em')::timestamptz ELSE t.conciliado_em END,
             valor_do_mes_em     = CASE WHEN v_set ? 'valor' THEN (b.antes->>'valor_do_mes_em')::timestamptz ELSE t.valor_do_mes_em END,
             valor_do_mes_origem = CASE WHEN v_set ? 'valor' THEN b.antes->>'valor_do_mes_origem' ELSE t.valor_do_mes_origem END,
             updated_at = now(), updated_by = coalesce(v_uid, t.updated_by)
       WHERE t.id = l.id;
      PERFORM set_config('app.conc_dividindo', 'off', true);
    END IF;
  END IF;
  UPDATE public.financeiro_baixas_no_vinculo
     SET desfeita_em = now(), desfeita_por = v_uid,
         desfeita_motivo = v_motivo || CASE WHEN cardinality(v_mantidos) > 0
                                            THEN ' · ficou como foi editado depois do casar: ' || array_to_string(v_mantidos, ', ') ELSE '' END
   WHERE id = b.id;
  RETURN NULL;
END;
$function$;

-- (5) a pendência "anexar a nota" (R5): as linhas de outra nota vivas, sem documento anexado
CREATE OR REPLACE FUNCTION public.fn_conc_outras_notas_pendentes(p_cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF p_cliente_id IS NULL OR NOT coalesce(public.tenant_ok(p_cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem acesso a este cliente.';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'lancamento_id', x.id, 'nf_id', b.lancamento_id, 'nf_numero', nf.numero_documento,
             'favorecido_id', x.favorecido_id, 'fornecedor', f.nome, 'numeros', coalesce(b.depois->'numeros', '[]'::jsonb),
             'valor', x.valor, 'data_pagamento', x.data_pagamento, 'extrato_id', b.depois->>'extrato_id', 'sem_conta', x.plano_conta_id IS NULL,
             'frase', format('Anexar a nota%s de %s (%s, pago em %s)',
                             CASE WHEN jsonb_array_length(coalesce(b.depois->'numeros', '[]'::jsonb)) > 0
                                  THEN ' nº ' || (SELECT string_agg(n, ', ') FROM jsonb_array_elements_text(b.depois->'numeros') n) ELSE '' END,
                             coalesce(f.nome, 'sem fornecedor'), public._fn_oc_brl(x.valor), public._fn_oc_data(x.data_pagamento)))
           ORDER BY x.data_pagamento, x.id)
      FROM public.financeiro_baixas_no_vinculo b
      JOIN public.financeiro_lancamentos_v2 x ON x.id = b.irmao_id AND x.cancelado IS NOT TRUE
      JOIN public.financeiro_lancamentos_v2 nf ON nf.id = b.lancamento_id
      LEFT JOIN public.financeiro_fornecedores f ON f.id = x.favorecido_id
     WHERE b.cliente_id = p_cliente_id AND b.tipo = 'outra_nota' AND b.desfeita_em IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.vw_lancamento_documentos d WHERE d.lancamento_id = x.id AND d.cancelado IS NOT TRUE)), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public._fn_conc_outras_notas(numeric, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_conc_outra_nota_linha(uuid, numeric, date, uuid, text[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_conc_guardar_antes(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_trg_conc_voltar_ao_desfazer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_conc_outras_notas_pendentes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conc_outras_notas_pendentes(uuid) TO authenticated;

-- (6) o Casar: o 3º gesto do "a mais" e o R2 na tela (sem "Ligar com o valor do extrato" quando é a NF que pergunta)
CREATE FUNCTION pg_temp.m115570_troca(p_def text, p_de text, p_para text, p_nome text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n int := (length(p_def) - length(replace(p_def, p_de, ''))) / greatest(length(p_de), 1);
BEGIN
  IF n <> 1 THEN RAISE EXCEPTION 'm115570: a âncora % casa % vez(es) (esperado 1). Nada gravado.', p_nome, n; END IF;
  RETURN replace(p_def, p_de, p_para);
END $f$;

DO $m$
DECLARE d text := pg_get_functiondef('public.fn_espelho_casar(uuid,jsonb,boolean,text)'::regprocedure);
BEGIN
  IF md5(d) <> '7edeed673d3f90897d2887bda1a69e5d' THEN RAISE EXCEPTION 'm115570: fn_espelho_casar mudou (md5 %). Nada gravado.', md5(d); END IF;
  d := pg_temp.m115570_troca(d, $a$v_x jsonb; v_novo uuid;$a$, $a$v_x jsonb; v_novo uuid; v_eh_nf boolean := false; v_on jsonb;$a$, 'O1 declare');
  d := pg_temp.m115570_troca(d, $a$v_dest := NULL; v_dif := 0;$a$, $a$v_dest := NULL; v_dif := 0; v_eh_nf := false;$a$, 'O2 zera');
  d := pg_temp.m115570_troca(d, $a$v_dest := nullif(btrim(coalesce(v_item->>'destino', '')), '');$a$,
$a$v_dest := nullif(btrim(coalesce(v_item->>'destino', '')), ''); v_eh_nf := true;$a$, 'O3 marca NF');
  d := pg_temp.m115570_troca(d, $a$(v_dest = 'juros' OR (v_dest = 'taxa' AND nullif(v_item->>'plano_conta_id', '') IS NOT NULL)) THEN$a$,
$a$(v_dest IN ('juros', 'outra_nota') OR (v_dest = 'taxa' AND nullif(v_item->>'plano_conta_id', '') IS NOT NULL)) THEN$a$, 'O4 a mais');
  d := pg_temp.m115570_troca(d, $a$'["juros","taxa"]'::jsonb$a$, $a$'["juros","taxa","outra_nota"]'::jsonb$a$, 'O5 opcoes');
  d := pg_temp.m115570_troca(d, $a$THEN 'juros/multa ou outra despesa sem nota (taxa)' ELSE$a$,
$a$THEN 'juros/multa, outra despesa sem nota (taxa) ou outra nota do fornecedor que falta lançar' ELSE$a$, 'O6 frase');
  d := pg_temp.m115570_troca(d, $a$IF v_val > abs(v_lan.valor) + 0.005$a$, $a$IF NOT v_eh_nf AND v_val > abs(v_lan.valor) + 0.005$a$, 'O7 R2 sem ligar com o extrato');
  d := pg_temp.m115570_troca(d, $a$v_nf_extras := v_nf_extras || jsonb_build_array(jsonb_build_object('nf', v_lid, 'tipo', v_dest, 'valor', v_dif, 'plano', v_item->>'plano_conta_id'));
    END IF;$a$,
$a$v_nf_extras := v_nf_extras || jsonb_build_array(jsonb_build_object('nf', v_lid, 'tipo', v_dest, 'valor', v_dif, 'plano', v_item->>'plano_conta_id'));
    ELSIF v_dest = 'outra_nota' AND v_dif > 0 THEN
      -- FILA 18/11 13:12: as notas que faltam (nº e, se souber, o valor de cada uma) → uma linha por nota com valor; as sem valor numa só
      v_on := public._fn_conc_outras_notas(v_dif, v_item->'outras_notas');
      IF (v_on->>'ok')::boolean IS NOT TRUE THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'outra_nota_soma', 'lancamento_id', v_lid, 'frase', v_on->>'frase');
      END IF;
      v_soma := v_soma + v_dir * v_dif;
      v_nf_extras := v_nf_extras || coalesce((SELECT jsonb_agg(jsonb_build_object('nf', v_lid, 'tipo', 'outra_nota', 'valor', (o->>'valor')::numeric,
                                                                                  'numeros', o->'numeros'))
                                                FROM jsonb_array_elements(v_on->'linhas') AS o), '[]'::jsonb);
    END IF;$a$, 'O8 linhas da outra nota');
  d := pg_temp.m115570_troca(d, $a$v_novo := public._fn_conc_linha_da_nf((v_x->>'nf')::uuid,$a$,
$a$v_novo := CASE WHEN v_x->>'tipo' = 'outra_nota'
                THEN public._fn_conc_outra_nota_linha((v_x->>'nf')::uuid, (v_x->>'valor')::numeric, v_ext.data_movimento, p_extrato_id,
                                                      ARRAY(SELECT jsonb_array_elements_text(coalesce(v_x->'numeros', '[]'::jsonb))), p_motivo)
                ELSE public._fn_conc_linha_da_nf((v_x->>'nf')::uuid,$a$, 'O9a cria');
  d := pg_temp.m115570_troca(d, $a$nullif(v_x->>'plano', '')::uuid);$a$, $a$nullif(v_x->>'plano', '')::uuid) END;$a$, 'O9b cria');
  d := pg_temp.m115570_troca(d, $a$IF v_x->>'tipo' IN ('juros', 'taxa') THEN$a$, $a$IF v_x->>'tipo' IN ('juros', 'taxa', 'outra_nota') THEN$a$, 'O10 casa no extrato');
  EXECUTE d;
END $m$;
