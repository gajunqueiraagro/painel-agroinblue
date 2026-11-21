-- BAIXA-DESCONTO-BANCO-01 (FILA 19/11 08:38, P1 aprovada): o desconto da NF NÃO é movimento de conta.
-- Antes: no casar com 'desconto' a NF ficava com o valor cheio (só o pago ligado ao extrato) e o "Desconto obtido" era sem caixa — todo
-- leitor de caixa (Conferência, Saldo no sistema, fluxo, lista) contava a NF cheia: o caixa saía maior que o banco pagou (NJ · BB · 20/10,
-- NF 404: −4.863,35 no lugar de −3.850,00; a Conferência mostrava o resto 1.013,35 com "!" e somava no dia).
-- Agora a NF se DIVIDE como no parcial: a NF fica com o que o banco pagou (ligada ao extrato) e a diferença vira a "parte paga com desconto"
-- (irmã pelo `saldo_de_id`, realizada na data, SEM CAIXA, mesma classificação, fornecedor e nº). O "Desconto obtido" (+, sem caixa) fica.
-- A NF nº X segue somando o valor dela nas partes; o DRE não muda (despesa cheia + desconto obtido); o caixa é o do banco em todo leitor,
-- sem mexer em nenhum. O desfazer cancela a parte junto (como o desconto) e a NF volta ao valor de antes pelo "casar" (R3).
-- Patches guardados por md5 do corpo atual (115560 / 115570).

SET LOCAL lock_timeout = '2s';

ALTER TABLE public.financeiro_baixas_no_vinculo DROP CONSTRAINT financeiro_baixas_no_vinculo_tipo_check;
ALTER TABLE public.financeiro_baixas_no_vinculo ADD CONSTRAINT financeiro_baixas_no_vinculo_tipo_check
  CHECK (tipo = ANY (ARRAY['divisao'::text, 'juncao'::text, 'baixa'::text, 'valor_real'::text, 'casar'::text, 'juros'::text, 'desconto'::text, 'taxa'::text,
                           'outra_nota'::text, 'desconto_parte'::text]));

-- (1) a parte da NF paga com o desconto: irmã sem caixa; a NF fica com o resto (o que o banco pagou)
CREATE OR REPLACE FUNCTION public._fn_conc_parte_do_desconto(p_nf uuid, p_valor numeric, p_data date, p_motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE l public.financeiro_lancamentos_v2; v_parte uuid := gen_random_uuid(); v_uid uuid := auth.uid(); v_cols text; v_vals text;
  v_valor numeric := round(abs(coalesce(p_valor, 0)), 2); v_sinal numeric; v_obs text; v_nro text;
BEGIN
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_nf FOR UPDATE;
  IF NOT FOUND OR l.cancelado IS TRUE OR l.tipo_operacao NOT LIKE '2-%' THEN
    RAISE EXCEPTION 'A parte paga com desconto só sai de uma nota de saída viva. Nada foi gravado.' USING ERRCODE = 'P0001', DETAIL = p_nf::text;
  END IF;
  IF v_valor <= 0 OR v_valor >= round(abs(l.valor), 2) THEN
    RAISE EXCEPTION 'O desconto de % não cabe na NF de %. Nada foi gravado.', public._fn_oc_brl(v_valor), public._fn_oc_brl(abs(l.valor))
      USING ERRCODE = 'P0001', DETAIL = p_nf::text;
  END IF;
  v_sinal := CASE WHEN l.valor < 0 THEN -1 ELSE 1 END;
  v_nro := coalesce(nullif(btrim(l.numero_documento), ''), 's/nº');
  v_obs := format('Parte de %s da NF nº %s (lançamento %s) paga com desconto, no casar com o extrato de %s: não sai do banco. Motivo: %s',
                  public._fn_oc_brl(v_valor), v_nro, l.id, public._fn_oc_data(p_data), coalesce(nullif(btrim(p_motivo), ''), 'desconto'));
  -- a irmã: cópia das colunas graváveis (o copiador do parcial, `_fn_conc_baixa_no_vinculo`), realizada e sem caixa
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum),
         string_agg(CASE a.attname
           WHEN 'id' THEN '$1' WHEN 'valor' THEN '$3' WHEN 'saldo_de_id' THEN '$2' WHEN 'observacao' THEN '$4'
           WHEN 'created_by' THEN '$5' WHEN 'updated_by' THEN '$5' WHEN 'data_pagamento' THEN '$6'
           WHEN 'status_transacao' THEN '''realizado''' WHEN 'conciliado_em' THEN 'NULL'
           WHEN 'sem_movimentacao_caixa' THEN 'true' WHEN 'origem_lancamento' THEN '''conciliacao''' WHEN 'origem_tipo' THEN '''conc:desconto_parte'''
           WHEN 'created_at' THEN 'now()' WHEN 'updated_at' THEN 'now()'
           WHEN 'hash_importacao' THEN 'NULL' WHEN 'lote_importacao_id' THEN 'NULL' WHEN 'staging_id' THEN 'NULL'
           WHEN 'duplicado_de_id' THEN 'NULL' WHEN 'status_duplicidade' THEN 'NULL' WHEN 'nivel_duplicidade' THEN 'NULL'
           WHEN 'importado_duplicado' THEN 'false' WHEN 'editado_manual' THEN 'false'
           WHEN 'orfao_definitivo' THEN 'false' WHEN 'orfao_definitivo_motivo' THEN 'NULL' WHEN 'orfao_definitivo_por' THEN 'NULL'
           WHEN 'orfao_definitivo_em' THEN 'NULL' WHEN 'cancelado' THEN 'false' WHEN 'cancelado_em' THEN 'NULL'
           WHEN 'cancelado_por' THEN 'NULL' WHEN 'cancelado_motivo' THEN 'NULL' WHEN 'transferencia_grupo_id' THEN 'NULL'
           WHEN 'recorrencia_id' THEN 'NULL' WHEN 'valor_do_mes_em' THEN 'NULL' WHEN 'valor_do_mes_origem' THEN 'NULL'
           ELSE quote_ident(a.attname) END, ', ' ORDER BY a.attnum)
    INTO v_cols, v_vals
    FROM pg_attribute a
   WHERE a.attrelid = 'public.financeiro_lancamentos_v2'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '';
  EXECUTE format('INSERT INTO public.financeiro_lancamentos_v2 (%s) SELECT %s FROM public.financeiro_lancamentos_v2 WHERE id = $2', v_cols, v_vals)
    USING v_parte, l.id, v_sinal * v_valor, v_obs, v_uid, p_data;
  PERFORM set_config('app.conc_dividindo', 'on', true);
  UPDATE public.financeiro_lancamentos_v2
     SET valor = v_sinal * round(abs(valor) - v_valor, 2), updated_at = now(), updated_by = coalesce(v_uid, updated_by)
   WHERE id = l.id;
  PERFORM set_config('app.conc_dividindo', 'off', true);
  INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, irmao_id, valor_original, valor_aplicado, valor_saldo,
      antes, depois, origem, motivo, feita_por)
  VALUES (l.cliente_id, 'desconto_parte', l.id, v_parte, l.valor, v_sinal * v_valor, v_sinal * round(abs(l.valor) - v_valor, 2),
          jsonb_build_object('valor', l.valor),
          jsonb_build_object('valor', v_sinal * round(abs(l.valor) - v_valor, 2), 'parte_id', v_parte, 'data', p_data), 'conserto',
          coalesce(nullif(btrim(p_motivo), ''), 'desconto'), v_uid);
  RETURN v_parte;
END;
$function$;
REVOKE ALL ON FUNCTION public._fn_conc_parte_do_desconto(uuid, numeric, date, text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION pg_temp.m115580_troca(p_def text, p_de text, p_para text, p_nome text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n int := (length(p_def) - length(replace(p_def, p_de, ''))) / greatest(length(p_de), 1);
BEGIN
  IF n <> 1 THEN RAISE EXCEPTION 'm115580: a âncora % casa % vez(es) (esperado 1). Nada gravado.', p_nome, n; END IF;
  RETURN replace(p_def, p_de, p_para);
END $f$;

DO $m$
DECLARE d text;
BEGIN
  -- (2) a linha do desconto nasce e a NF se divide (o casar liga ao extrato só o que o banco pagou, que é o novo valor da NF)
  d := pg_get_functiondef('public._fn_conc_linha_da_nf(uuid,text,numeric,date,uuid,text,uuid)'::regprocedure);
  IF md5(d) <> '6c2ec23c924bb385faf1ee4fc0bbb337' THEN RAISE EXCEPTION 'm115580: _fn_conc_linha_da_nf mudou (md5 %). Nada gravado.', md5(d); END IF;
  d := pg_temp.m115580_troca(d, $a$  RETURN v_novo;$a$,
$a$  -- BAIXA-DESCONTO-BANCO-01: o desconto não é caixa — a NF fica com o que o banco pagou e a diferença vira a parte paga com desconto
  IF v_desc THEN PERFORM public._fn_conc_parte_do_desconto(l.id, v_valor, p_data, v_motivo); END IF;
  RETURN v_novo;$a$, 'P1 divide');
  EXECUTE d;

  -- (3) a parte não tem "antes" (sai com o desfazer da NF)
  d := pg_get_functiondef('public._fn_conc_guardar_antes(uuid,uuid,text)'::regprocedure);
  IF md5(d) <> 'f81bc2bbfb0d2233ccb013e349b770f6' THEN RAISE EXCEPTION 'm115580: _fn_conc_guardar_antes mudou (md5 %). Nada gravado.', md5(d); END IF;
  d := pg_temp.m115580_troca(d, $a$'conc:taxa', 'conc:outra_nota') THEN RETURN;$a$,
                                $a$'conc:taxa', 'conc:outra_nota', 'conc:desconto_parte') THEN RETURN;$a$, 'P2 sem antes');
  EXECUTE d;

  -- (4) o desfazer cancela a parte junto; a NF volta ao valor de antes pelo "casar"
  d := pg_get_functiondef('public._fn_trg_conc_voltar_ao_desfazer()'::regprocedure);
  IF md5(d) <> '8bd73d9e0fb232acbc6b94f8447d36a3' THEN RAISE EXCEPTION 'm115580: _fn_trg_conc_voltar_ao_desfazer mudou (md5 %). Nada gravado.', md5(d); END IF;
  d := pg_temp.m115580_troca(d, $a$tipo IN ('juros', 'desconto', 'taxa', 'outra_nota') AND desfeita_em IS NULL FOR UPDATE LOOP$a$,
                                $a$tipo IN ('juros', 'desconto', 'taxa', 'outra_nota', 'desconto_parte') AND desfeita_em IS NULL FOR UPDATE LOOP$a$, 'P3 cancela');
  d := pg_temp.m115580_troca(d, $a$WHEN 'outra_nota' THEN 'Outra nota (falta lançar)' ELSE 'Desconto obtido' END$a$,
                                $a$WHEN 'outra_nota' THEN 'Outra nota (falta lançar)' WHEN 'desconto_parte' THEN 'Parte paga com desconto' ELSE 'Desconto obtido' END$a$, 'P4 rótulo');
  EXECUTE d;
END $m$;
