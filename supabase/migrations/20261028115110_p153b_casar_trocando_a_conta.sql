-- P153b (D3, Gabriel 29/10; caminho 1 aprovado em 29/10): "Casar e trocar a conta para <conta do extrato>" — o lançamento EM ABERTO
-- (previsto/agendado/programado, sem pagamento) de OUTRA conta casa com a linha do extrato e passa para a conta dela NA MESMA TRANSAÇÃO
-- do casar: se o casar falha, nada fica trocado. Nenhum gravador novo: é a `fn_espelho_casar` de hoje com uma opção POR ITEM.
--
-- ESTADO ANTERIOR: fn_espelho_casar(uuid, jsonb, boolean, text)  md5(prosrc) = 27a4be32780a129dd599b66b31d0ffe7
--
-- O QUE MUDA (só o corpo; assinatura, SECURITY DEFINER, search_path e ACL iguais; nenhum dado)
--   · o item aceita `trocar_conta: true`. Só vale para lançamento em aberto (sem `data_pagamento`) de entrada ou saída:
--       pago/realizado/conciliado → recusa `trocar_conta_so_em_aberto` (a tela só mostra o selo "outra conta"); transferência →
--       `trocar_conta_transferencia`. Nada gravado nas recusas.
--   · a SIMULAÇÃO devolve `trocas_conta` [{lancamento_id, de_id, de, para_id, para}] — o "antes × depois" da confirmação curta;
--     valor e data viram os do extrato como no casar de hoje (o `pergunta`/`aceitar_valor_extrato` de sempre).
--   · a GRAVAÇÃO troca a conta (entrada: `conta_destino_id`; saída: `conta_bancaria_id`) ANTES do valor do extrato e do vínculo, na
--     mesma transação; a trilha é o `audit_log` do lançamento (autor = quem está logado, o gatilho de sempre). A volta: desfazer o
--     vínculo e editar a conta, como qualquer casar.
--   · sem `trocar_conta`: exatamente como hoje — a conta só é preenchida quando está vazia, e o gravador do vínculo recusa
--     lançamento de outra conta ("… é da conta B e o movimento do banco é da conta A …"; achado no ensaio de 30/10).
-- PATCH GUARDADO POR md5 (origem, cada âncora exatamente 1x, destino conferido no ensaio).

DO $mig$
DECLARE
  v_src text; v_novo text; v_a text; v_b text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = 'public.fn_espelho_casar(uuid,jsonb,boolean,text)'::regprocedure;
  IF md5(v_src) <> '27a4be32780a129dd599b66b31d0ffe7' THEN
    RAISE EXCEPTION 'P153b: fn_espelho_casar com corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;

  -- C1: as variaveis
  v_a := $a1$  v_perg jsonb; v_aceitos uuid[] := '{}'; v_novos numeric[] := '{}';
BEGIN
$a1$;
  v_b := $b1$  v_perg jsonb; v_aceitos uuid[] := '{}'; v_novos numeric[] := '{}';
  -- P153b (D3): as trocas de conta pedidas pelos itens (`trocar_conta`), o antes x depois da confirmacao
  v_trocas jsonb := '[]'::jsonb; v_conta_atual uuid; v_troca jsonb;
BEGIN
$b1$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'P153b: ancora C1 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- C2: a conferencia do item que pede a troca (antes de qualquer escrita; vale para a simulacao)
  v_a := $a2$    v_val := abs(COALESCE((v_item->>'valor')::numeric, v_lan.valor));
$a2$;
  v_b := $b2$    -- P153b (D3, Gabriel 29/10): "Casar e trocar a conta para <conta do extrato>" — so' lancamento EM ABERTO (previsto/agendado/
    -- programado, sem pagamento), entrada ou saida. Pago/conciliado de outra conta nunca troca (a tela so' mostra "outra conta").
    IF coalesce((v_item->>'trocar_conta')::boolean, false) THEN
      IF v_lan.status_transacao NOT IN ('previsto', 'agendado', 'programado') OR v_lan.data_pagamento IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'trocar_conta_so_em_aberto', 'lancamento_id', v_lid,
          'frase', 'Só lançamento em aberto troca de conta ao casar. Este já foi pago: confira a conta dele.');
      END IF;
      IF v_lan.tipo_operacao NOT LIKE '1-%' AND v_lan.tipo_operacao NOT LIKE '2-%' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'trocar_conta_transferencia', 'lancamento_id', v_lid,
          'frase', 'Transferência não troca de conta ao casar.');
      END IF;
      v_conta_atual := v_lan.conta_efetiva_id;
      IF v_conta_atual IS DISTINCT FROM v_ext.conta_bancaria_id THEN
        v_trocas := v_trocas || jsonb_build_array(jsonb_build_object('lancamento_id', v_lid,
          'de_id', v_conta_atual,
          'de', (SELECT coalesce(cb.nome_exibicao, cb.nome_conta) FROM financeiro_contas_bancarias cb WHERE cb.id = v_conta_atual),
          'para_id', v_ext.conta_bancaria_id,
          'para', (SELECT coalesce(cb.nome_exibicao, cb.nome_conta) FROM financeiro_contas_bancarias cb WHERE cb.id = v_ext.conta_bancaria_id)));
      END IF;
    END IF;
    v_val := abs(COALESCE((v_item->>'valor')::numeric, v_lan.valor));
$b2$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'P153b: ancora C2 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- C3: a simulacao devolve o antes x depois das contas
  v_a := $a3$'data_extrato', v_ext.data_movimento)
           || CASE WHEN v_perg IS NOT NULL$a3$;
  v_b := $b3$'data_extrato', v_ext.data_movimento)
           || CASE WHEN jsonb_array_length(v_trocas) > 0 THEN jsonb_build_object('trocas_conta', v_trocas) ELSE '{}'::jsonb END
           || CASE WHEN v_perg IS NOT NULL$b3$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'P153b: ancora C3 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- C4: a troca, na MESMA transacao do casar, antes do valor do extrato e do vinculo
  v_a := $a4$  -- o valor do extrato aceito: pelo nucleo, com trilha (o UPDATE abaixo ja' encontra o valor novo)
$a4$;
  v_b := $b4$  -- P153b (D3): a troca de conta pedida, na MESMA transacao do casar (o casar falhou = nada trocado). Trilha: o audit_log do
  -- lancamento (gatilho de sempre; autor = quem esta' logado).
  FOR v_troca IN SELECT * FROM jsonb_array_elements(v_trocas) LOOP
    UPDATE financeiro_lancamentos_v2
       SET conta_bancaria_id = CASE WHEN tipo_operacao LIKE '1-%' THEN NULL ELSE v_ext.conta_bancaria_id END,
           conta_destino_id  = CASE WHEN tipo_operacao LIKE '1-%' THEN v_ext.conta_bancaria_id ELSE NULL END,
           updated_by = v_uid, updated_at = v_agora
     WHERE id = (v_troca->>'lancamento_id')::uuid AND status_transacao IN ('previsto', 'agendado', 'programado')
       AND data_pagamento IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'P153b: a troca de conta nao achou o lancamento em aberto % (nada gravado)', v_troca->>'lancamento_id'
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  -- o valor do extrato aceito: pelo nucleo, com trilha (o UPDATE abaixo ja' encontra o valor novo)
$b4$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'P153b: ancora C4 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- C5: o retorno da gravacao diz o que foi trocado
  v_a := $a5$'ids', to_jsonb(v_ids));$a5$;
  v_b := $b5$'ids', to_jsonb(v_ids), 'trocas_conta', v_trocas);$b5$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'P153b: ancora C5 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  IF md5(v_novo) <> 'd66d349e16c0b10dfe963ebea21da7fb' THEN
    RAISE EXCEPTION 'P153b: fn_espelho_casar com corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.fn_espelho_casar(%s) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS %L$f$,
                 pg_get_function_arguments('public.fn_espelho_casar(uuid,jsonb,boolean,text)'::regprocedure), v_novo);
END $mig$;

DO $conf$
DECLARE r record;
BEGIN
  SELECT p.oid, p.prosecdef INTO r FROM pg_proc p WHERE p.oid = 'public.fn_espelho_casar(uuid,jsonb,boolean,text)'::regprocedure;
  IF NOT r.prosecdef OR has_function_privilege('anon', r.oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'P153b: fn_espelho_casar fora do esperado (secdef/ACL)';
  END IF;
END $conf$;
