-- CONC-DESCONCILIAR-EDSON-01 · fatia 2 (FILA 18/11 09:22, Gabriel): NF paga A MAIS — além de "Juros/multa", "Outra despesa sem nota (taxa)"
-- com o subcentro escolhido pelo operador. Caso: o cartão pagou 109,00 por uma NF de 87,20 (taxa de plataforma de 21,80 — não é juros).
--   · `_fn_conc_linha_da_nf` ganha a forma de 7 argumentos (a conta da taxa: de saída, ativa, do plano do cliente); a de 6 passa para ela
--   · o casar aceita destino 'taxa' + `plano_conta_id` no item; a pergunta da NF a mais oferece ["juros","taxa"]
--   · a linha da taxa nasce realizada, no MESMO extrato (como os juros), presa à NF em `financeiro_baixas_no_vinculo` tipo 'taxa';
--     o desfazer a cancela junto (como os juros e o desconto); o guardar-antes a pula
-- Os blocos das funções 115540 são copiados do arquivo 115540 e só mudam onde a taxa entra; o Casar muda por patch guardado por md5.

ALTER TABLE public.financeiro_baixas_no_vinculo DROP CONSTRAINT financeiro_baixas_no_vinculo_tipo_check;
ALTER TABLE public.financeiro_baixas_no_vinculo ADD CONSTRAINT financeiro_baixas_no_vinculo_tipo_check
  CHECK (tipo = ANY (ARRAY['divisao'::text, 'juncao'::text, 'baixa'::text, 'valor_real'::text, 'casar'::text, 'juros'::text, 'desconto'::text, 'taxa'::text]));

-- (1) a linha da NF, agora com a taxa (conta escolhida)
CREATE OR REPLACE FUNCTION public._fn_conc_linha_da_nf(p_nf uuid, p_tipo text, p_valor numeric, p_data date, p_extrato_id uuid, p_motivo text, p_plano_conta_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE l public.financeiro_lancamentos_v2; v_plano uuid; v_novo uuid; v_uid uuid := auth.uid(); v_nro text; v_conta uuid;
  v_desc boolean := p_tipo = 'desconto'; v_taxa boolean := p_tipo = 'taxa'; v_valor numeric := round(abs(coalesce(p_valor, 0)), 2);
  v_motivo text := coalesce(nullif(btrim(p_motivo), ''), CASE WHEN p_tipo = 'desconto' THEN 'desconto' WHEN p_tipo = 'taxa' THEN 'taxa' ELSE 'juros/multa' END);
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('juros', 'desconto', 'taxa') OR v_valor <= 0 THEN
    RAISE EXCEPTION 'Linha da NF: tipo ou valor inválido (% / %). Nada foi gravado.', coalesce(p_tipo, '-'), coalesce(p_valor::text, '-') USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_nf;
  IF NOT FOUND OR l.cancelado IS TRUE OR l.tipo_operacao NOT LIKE '2-%' THEN
    RAISE EXCEPTION 'A linha de juros/taxa/desconto só nasce de uma nota de saída viva. Nada foi gravado.' USING ERRCODE = 'P0001', DETAIL = p_nf::text;
  END IF;
  IF v_taxa THEN
    -- FILA 18/11 09:22: "outra despesa sem nota (taxa)" — a conta é a que o operador escolheu: de saída, ativa, do plano deste cliente
    SELECT pc.id INTO v_plano FROM public.financeiro_plano_contas pc
     WHERE pc.id = p_plano_conta_id AND pc.ativo AND pc.tipo_operacao LIKE '2-%' AND (pc.cliente_id IS NULL OR pc.cliente_id = l.cliente_id);
    IF v_plano IS NULL THEN
      RAISE EXCEPTION 'Escolha a conta (subcentro) de saída da taxa. Nada foi gravado.' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    SELECT pc.id INTO v_plano FROM public.financeiro_plano_contas pc
     WHERE pc.cliente_id IS NULL AND pc.ativo AND pc.subcentro = CASE WHEN v_desc THEN 'Desconto obtido' ELSE 'Juros/multa por atraso' END;
  END IF;
  IF v_plano IS NULL THEN
    RAISE EXCEPTION 'A conta "%" não está no plano de contas. Nada foi gravado.', CASE WHEN v_desc THEN 'Desconto obtido' ELSE 'Juros/multa por atraso' END
      USING ERRCODE = 'P0001';
  END IF;
  -- o nº da NF: o do lançamento; sem ele, o da nota anexada
  v_nro := coalesce(nullif(btrim(l.numero_documento), ''),
                    (SELECT nullif(btrim(d.numero), '') FROM public.vw_lancamento_documentos d
                      WHERE d.lancamento_id = l.id AND d.cancelado IS NOT TRUE AND d.especie LIKE 'nf%' AND nullif(btrim(d.numero), '') IS NOT NULL
                      ORDER BY d.uploaded_em NULLS LAST LIMIT 1),
                    's/nº');
  v_conta := coalesce(l.conta_bancaria_id, (SELECT e.conta_bancaria_id FROM public.extrato_bancario_v2 e WHERE e.id = p_extrato_id));
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, ano_mes, valor, tipo_operacao, sinal, descricao, status_transacao,
      data_pagamento, conta_bancaria_id, conta_destino_id, data_competencia, data_vencimento, plano_conta_id, favorecido_id, cenario,
      origem_lancamento, origem_tipo, numero_documento, sem_movimentacao_caixa, forma_pagamento, observacao, created_by, updated_by)
  VALUES (l.cliente_id, l.fazenda_id, to_char(p_data, 'YYYY-MM'), v_valor,
          CASE WHEN v_desc THEN '1-Entradas' ELSE l.tipo_operacao END, CASE WHEN v_desc THEN '1' ELSE '-1' END,
          format('%s da NF nº %s', CASE WHEN v_desc THEN 'Desconto obtido' WHEN v_taxa THEN 'Taxa (sem nota)' ELSE 'Juros/multa' END, v_nro), 'realizado',
          p_data, CASE WHEN v_desc THEN NULL ELSE v_conta END, CASE WHEN v_desc THEN v_conta ELSE NULL END, p_data, p_data, v_plano,
          l.favorecido_id, coalesce(l.cenario, 'realizado'), 'conciliacao', 'conc:' || p_tipo, l.numero_documento, v_desc,
          CASE WHEN v_desc THEN NULL ELSE l.forma_pagamento END,
          format('%s de %s da NF nº %s (lançamento %s), no casar com o extrato de %s. Motivo: %s',
                 CASE WHEN v_desc THEN 'Desconto obtido' WHEN v_taxa THEN 'Taxa (sem nota)' ELSE 'Juros/multa' END, public._fn_oc_brl(v_valor), v_nro, l.id,
                 public._fn_oc_data(p_data), v_motivo),
          v_uid, v_uid)
  RETURNING id INTO v_novo;
  INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, irmao_id, valor_original, valor_aplicado, antes, depois,
      origem, motivo, feita_por)
  VALUES (l.cliente_id, p_tipo, l.id, v_novo, l.valor, v_valor, '{}'::jsonb,
          jsonb_build_object('linha_id', v_novo, 'extrato_id', p_extrato_id, 'data', p_data, 'plano_conta_id', v_plano), 'conserto', v_motivo, v_uid);
  RETURN v_novo;
END;
$function$;

-- (2) a de 6 argumentos passa para a de 7
CREATE OR REPLACE FUNCTION public._fn_conc_linha_da_nf(p_nf uuid, p_tipo text, p_valor numeric, p_data date, p_extrato_id uuid, p_motivo text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- a de 6 argumentos (juros, desconto: a conta é a do plano padrão) segue valendo e passa para a de 7
  SELECT public._fn_conc_linha_da_nf(p_nf, p_tipo, p_valor, p_data, p_extrato_id, p_motivo, NULL::uuid)
$function$;

-- (3) o guardar-antes pula a linha da taxa
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
  IF NOT FOUND OR l.cancelado IS TRUE OR coalesce(l.origem_tipo, '') IN ('conc:juros', 'conc:desconto', 'conc:taxa') THEN RETURN; END IF;
  INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, valor_original, antes, depois, origem, motivo, feita_por)
  VALUES (l.cliente_id, 'casar', l.id, l.valor, public._fn_conc_estado_do_lancamento(l.id) || jsonb_build_object('extrato_id', p_extrato_id),
          '{}'::jsonb, CASE WHEN p_origem = 'gatilho' THEN 'gatilho' ELSE 'conserto' END, 'antes do casar', auth.uid());
END;
$function$;

-- (4) o desfazer cancela a linha da taxa junto
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
            WHERE lancamento_id = NEW.lancamento_id AND tipo IN ('juros', 'desconto', 'taxa') AND desfeita_em IS NULL FOR UPDATE LOOP
    PERFORM set_config('app.conc_dividindo', 'on', true);
    UPDATE public.financeiro_lancamentos_v2
       SET cancelado = true, cancelado_em = now(), cancelado_por = v_uid,
           cancelado_motivo = format('%s da NF desfeito junto com o casar (%s).', CASE x.tipo WHEN 'juros' THEN 'Juros/multa' WHEN 'taxa' THEN 'Taxa (sem nota)' ELSE 'Desconto obtido' END, v_motivo),
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

REVOKE ALL ON FUNCTION public._fn_conc_linha_da_nf(uuid, text, numeric, date, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_conc_linha_da_nf(uuid, text, numeric, date, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_conc_guardar_antes(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_trg_conc_voltar_ao_desfazer() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION pg_temp.m115550_troca(p_def text, p_de text, p_para text, p_nome text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n int := (length(p_def) - length(replace(p_def, p_de, ''))) / greatest(length(p_de), 1);
BEGIN
  IF n <> 1 THEN RAISE EXCEPTION 'm115550: a âncora % casa % vez(es) (esperado 1). Nada gravado.', p_nome, n; END IF;
  RETURN replace(p_def, p_de, p_para);
END $f$;

DO $m$
DECLARE d text := pg_get_functiondef('public.fn_espelho_casar(uuid,jsonb,boolean,text)'::regprocedure);
BEGIN
  IF md5(d) <> 'b74f526db8546adcede2d8d996a96914' THEN RAISE EXCEPTION 'm115550: fn_espelho_casar mudou (md5 %). Nada gravado.', md5(d); END IF;
  d := pg_temp.m115550_troca(d, $a$IF v_val > abs(v_lan.valor) AND v_dest = 'juros' THEN$a$,
$a$IF v_val > abs(v_lan.valor) AND (v_dest = 'juros' OR (v_dest = 'taxa' AND nullif(v_item->>'plano_conta_id', '') IS NOT NULL)) THEN$a$, 'T1 a mais');
  d := pg_temp.m115550_troca(d, $a$IF v_dest = 'juros' AND v_dif > 0 THEN$a$, $a$IF v_dest IN ('juros', 'taxa') AND v_dif > 0 THEN$a$, 'T2 soma');
  d := pg_temp.m115550_troca(d, $a$jsonb_build_object('nf', v_lid, 'tipo', 'juros', 'valor', v_dif)$a$,
$a$jsonb_build_object('nf', v_lid, 'tipo', v_dest, 'valor', v_dif, 'plano', v_item->>'plano_conta_id')$a$, 'T3 extra');
  d := pg_temp.m115550_troca(d, $a$'["juros"]'::jsonb$a$, $a$'["juros","taxa"]'::jsonb$a$, 'T4 opcoes');
  d := pg_temp.m115550_troca(d, $a$THEN 'juros/multa' ELSE 'desconto (com o motivo) ou pagamento parcial' END$a$,
$a$THEN 'juros/multa ou outra despesa sem nota (taxa)' ELSE 'desconto (com o motivo) ou pagamento parcial' END$a$, 'T5 frase');
  d := pg_temp.m115550_troca(d, $a$v_novo := public._fn_conc_linha_da_nf((v_x->>'nf')::uuid, v_x->>'tipo', (v_x->>'valor')::numeric, v_ext.data_movimento, p_extrato_id,
                                          coalesce(v_x->>'motivo', p_motivo));$a$,
$a$v_novo := public._fn_conc_linha_da_nf((v_x->>'nf')::uuid, v_x->>'tipo', (v_x->>'valor')::numeric, v_ext.data_movimento, p_extrato_id,
                                          coalesce(v_x->>'motivo', p_motivo), nullif(v_x->>'plano', '')::uuid);$a$, 'T6 linha');
  d := pg_temp.m115550_troca(d, $a$IF v_x->>'tipo' = 'juros' THEN$a$, $a$IF v_x->>'tipo' IN ('juros', 'taxa') THEN$a$, 'T7 casa no extrato');
  EXECUTE d;
END $m$;
