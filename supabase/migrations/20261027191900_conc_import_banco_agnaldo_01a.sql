-- PR-CONC-IMPORT-BANCO-AGNALDO-01A — RESTAURACAO DE AGOSTO DO BRADESCO DO AGNALDO (so' banco)
--
-- POR QUE: em 03/10 as 16:39:18.7553 UTC a importacao 95c641a0 (CSV de 09/09, "AGO26 -b7e4052e-….csv", 100 extratos de 03/08
-- a 02/09) foi desfeita por `fn_extrato_desfazer_arquivo` com o motivo "mes errado", achando que era agosto posto em setembro.
-- 93 extratos eram de AGOSTO. O desfazer: cancelou os 100 extratos (status -> 'nao_conciliado'); desfez 108 vinculos vivos
-- (80 ofx_cru, 20 agrupamento_manual em 6 grupos antigos, 7 manual, 1 ofx_substituiu); CANCELOU os 80 lancamentos dos ofx_cru
-- (todos classificados; um deles, f1b7f361, com parte de OC viva); devolveu o 7f51a6cc (ofx_substituiu) a programado sem data;
-- e, pelo gatilho da OC, estornou duas liquidacoes automaticas (3.100 na OC 6a44fb9b, 5.943 na OC dbda3338). Ago/26, que
-- estava 'conciliado' (0 dias com diferenca, saldo do sistema 54.738,55), ficou 'nao_conciliado' com 1.725.884,04 de diferenca.
--
-- O QUE FAZ (decisoes do Gabriel no PARE de 03/10 14:09), numa transacao:
--   1. GUARDAS DE ORIGEM: aborta se o estado nao for exatamente o medido (M1).
--   2. Restaura o que o desfazer mudou, com o que o proprio sistema registrou:
--      - 93 extratos de agosto: cancelado_em/por/motivo = NULL e status 'conciliado' (o status anterior NAO esta' registrado;
--        decisao (a): pelo invariante medido — em 4.836 de 4.837 extratos ativos do proto, 'conciliado' <=> vinculo vivo — e os 93
--        tem >= 1 vinculo restaurado). Os 7 de 02/09 ficam cancelados, com o motivo deles.
--      - 108 vinculos: desfeito_em/por/motivo = NULL nas MESMAS linhas (grupo e snapshot intactos).
--      - 80 lancamentos: cancelado, cancelado_em, cancelado_por, cancelado_motivo = `audit_log.dados_anteriores`;
--        7f51a6cc: data_pagamento e status_transacao = `audit_log.dados_anteriores`. SO' os campos que o desfazer mudou (medido:
--        a linha atual difere de `dados_anteriores` so' neles e em updated_at).
--      - cabecalho 95c641a0: status 'processada', cancelado_em/cancelado_motivo = NULL (decisao (b)).
--      - as 2 liquidacoes de OC voltam pelo DONO (o gatilho `oc_sincronizar_liquidacao_de_financeiro`, quando o lancamento volta
--        a realizado); esta migration NAO escreve em tabela de OC.
--   3. Trilha: `conciliacao_audit_log` 'importacao_restaurada' por extrato restaurado.
--   4. Limpeza (decisao (d)): os 4 cabecalhos vazios das tentativas de 03/10 (e2c922ae, cd005de2, 0ff44d34, 1cc180d6), com guarda
--      de 0 extratos e 0 lancamentos ligados. Os 3 do NJ nao sao tocados.
--   5. Tabela de backfill `conc_import_agnaldo_01a_backfill`: o antes/depois de cada linha e o gesto contrario escrito.
--   6. GUARDAS DE DESTINO: aborta se nao fechar.
-- O staging do Enriquecer (397 linhas ligadas aos 108 lancamentos, 369 delas apontando para cancelado) nao e' tocado: volta a
-- apontar para lancamentos vivos quando eles voltam.

-- A trilha pede uma acao nova no vocabulario de `conciliacao_audit_log` (o CHECK nao tinha 'importacao_restaurada'): ADITIVO,
-- a lista de antes inteira + o valor novo, guardado pela definicao atual.
DO $acao$
BEGIN
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'conciliacao_audit_log_acao_check'
        AND conrelid = 'public.conciliacao_audit_log'::regclass)
     IS DISTINCT FROM 'CHECK ((acao = ANY (ARRAY[''conciliacao_criada''::text, ''conciliacao_desfeita''::text, ''conciliacao_substituida''::text, ''extrato_marcado_orfao''::text, ''extrato_desmarcado_orfao''::text, ''lancamento_marcado_orfao''::text, ''lancamento_desmarcado_orfao''::text, ''importacao_revertida''::text, ''mes_reaberto''::text, ''mes_fechado''::text, ''warning_mes_fechado''::text, ''warning_delete_extrato''::text, ''extrato_ignorado''::text, ''derivado_promovido_independente''::text, ''derivado_cancelado_com_origem''::text, ''movimento_cancelado''::text, ''movimento_cancelamento_revertido''::text])))' THEN
    RAISE EXCEPTION 'conciliacao_audit_log_acao_check nao esta na definicao esperada. Migration abortada.';
  END IF;
END $acao$;
ALTER TABLE public.conciliacao_audit_log DROP CONSTRAINT conciliacao_audit_log_acao_check;
ALTER TABLE public.conciliacao_audit_log ADD CONSTRAINT conciliacao_audit_log_acao_check CHECK (acao = ANY (ARRAY[
  'conciliacao_criada', 'conciliacao_desfeita', 'conciliacao_substituida', 'extrato_marcado_orfao', 'extrato_desmarcado_orfao',
  'lancamento_marcado_orfao', 'lancamento_desmarcado_orfao', 'importacao_revertida', 'mes_reaberto', 'mes_fechado',
  'warning_mes_fechado', 'warning_delete_extrato', 'extrato_ignorado', 'derivado_promovido_independente',
  'derivado_cancelado_com_origem', 'movimento_cancelado', 'movimento_cancelamento_revertido', 'importacao_restaurada']));

CREATE TABLE public.conc_import_agnaldo_01a_backfill (
  id bigserial PRIMARY KEY,
  tabela text NOT NULL,
  registro_id uuid NOT NULL,
  campos text[] NOT NULL,
  antes jsonb NOT NULL,
  depois jsonb,
  gesto_contrario text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.conc_import_agnaldo_01a_backfill ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.conc_import_agnaldo_01a_backfill FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.conc_import_agnaldo_01a_backfill_id_seq FROM PUBLIC, anon, authenticated;

DO $restaura$
DECLARE
  c_t constant timestamptz := '2026-10-03 16:39:18.7553+00';
  c_imp constant uuid := '95c641a0-7afc-443d-896b-504849c25f55';
  c_cli constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  c_conta constant uuid := '186a093b-0204-4164-95e3-0dd247457ffa';
  c_subst constant uuid := '7f51a6cc-0000-0000-0000-000000000000';
  c_vazios constant text[] := ARRAY['e2c922ae', 'cd005de2', '0ff44d34', '1cc180d6'];
  v_subst uuid; v_n int; v_n2 int; v_ids_vazios uuid[];
BEGIN
  -- ═══ 1. GUARDAS DE ORIGEM ═══
  IF NOT EXISTS (SELECT 1 FROM financeiro_importacoes_v2 i WHERE i.id = c_imp AND i.cliente_id = c_cli AND i.conta_bancaria_id = c_conta
                   AND i.status = 'cancelada' AND i.cancelado_em = c_t AND i.cancelado_motivo = 'mes errado') THEN
    RAISE EXCEPTION 'G1: o cabecalho 95c641a0 nao esta no estado medido. Migration abortada.';
  END IF;
  SELECT count(*), count(*) FILTER (WHERE e.data_movimento < '2026-09-01') INTO v_n, v_n2 FROM extrato_bancario_v2 e
   WHERE e.importacao_id = c_imp AND e.cancelado_em = c_t AND e.cancelado_motivo = 'mes errado' AND e.status = 'nao_conciliado'
     AND e.updated_at = c_t AND e.conta_bancaria_id = c_conta;
  IF v_n <> 100 OR v_n2 <> 93 OR (SELECT count(*) FROM extrato_bancario_v2 e WHERE e.importacao_id = c_imp) <> 100 THEN
    RAISE EXCEPTION 'G2: extratos da importacao fora do estado medido (% no estado, % de agosto). Migration abortada.', v_n, v_n2;
  END IF;
  CREATE TEMP TABLE r01a_ext ON COMMIT DROP AS
    SELECT e.* FROM extrato_bancario_v2 e WHERE e.importacao_id = c_imp AND e.data_movimento < '2026-09-01';
  CREATE TEMP TABLE r01a_cbi ON COMMIT DROP AS
    SELECT c.* FROM conciliacao_bancaria_itens c WHERE c.extrato_id IN (SELECT id FROM r01a_ext) AND c.desfeito_em = c_t;
  IF (SELECT count(*) FROM r01a_cbi) <> 108 OR EXISTS (SELECT 1 FROM r01a_cbi WHERE desfeito_motivo <> 'mes errado')
     OR (SELECT count(DISTINCT extrato_id) FROM r01a_cbi) <> 93 OR (SELECT count(DISTINCT lancamento_id) FROM r01a_cbi) <> 108
     OR EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c JOIN extrato_bancario_v2 e ON e.id = c.extrato_id
                 WHERE e.importacao_id = c_imp AND e.data_movimento >= '2026-09-01' AND c.desfeito_em = c_t) THEN
    RAISE EXCEPTION 'G3: vinculos desfeitos fora do estado medido (%). Migration abortada.', (SELECT count(*) FROM r01a_cbi);
  END IF;
  -- os lancamentos dos 108 vinculos: nenhum com vinculo vivo hoje, nenhum mexido depois do gesto
  IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.lancamento_id IN (SELECT lancamento_id FROM r01a_cbi) AND c.desfeito_em IS NULL)
     OR EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 l WHERE l.id IN (SELECT lancamento_id FROM r01a_cbi) AND l.updated_at > c_t)
     OR EXISTS (SELECT 1 FROM audit_log a WHERE a.registro_id IN (SELECT lancamento_id FROM r01a_cbi) AND a.created_at > c_t) THEN
    RAISE EXCEPTION 'G5: algum lancamento dos 108 vinculos foi mexido depois de 16:39:18. Migration abortada.';
  END IF;
  CREATE TEMP TABLE r01a_aud ON COMMIT DROP AS
    SELECT a.registro_id, a.acao, a.dados_anteriores AS d FROM audit_log a
     WHERE a.tabela_origem = 'financeiro_lancamentos_v2' AND a.created_at = c_t AND a.registro_id IN (SELECT lancamento_id FROM r01a_cbi);
  SELECT count(*) FILTER (WHERE x.acao = 'cancelou'), count(*) FILTER (WHERE x.acao = 'editou') INTO v_n, v_n2 FROM r01a_aud x;
  IF v_n <> 80 OR v_n2 <> 1
     OR (SELECT count(*) FROM financeiro_lancamentos_v2 l JOIN r01a_aud x ON x.registro_id = l.id AND x.acao = 'cancelou'
          WHERE l.cancelado AND l.cancelado_em = c_t AND l.cancelado_motivo = 'arquivo desfeito: AGO26 -b7e4052e-a3cc-43ea-b199-2f3aa2b545a1.csv'
            AND (x.d->>'cancelado')::boolean IS NOT TRUE) <> 80 THEN
    RAISE EXCEPTION 'G4: lancamentos cancelados no gesto fora do estado medido (% cancelou, % editou). Migration abortada.', v_n, v_n2;
  END IF;
  SELECT x.registro_id INTO v_subst FROM r01a_aud x WHERE x.acao = 'editou';
  IF left(v_subst::text, 8) <> left(c_subst::text, 8)
     OR NOT EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 l WHERE l.id = v_subst AND l.status_transacao = 'programado'
                     AND l.data_pagamento IS NULL AND NOT coalesce(l.cancelado, false)) THEN
    RAISE EXCEPTION 'G4b: o 7f51a6cc nao esta programado sem data. Migration abortada.';
  END IF;
  -- a linha atual difere de dados_anteriores SO' nos campos que o desfazer mudou (e em updated_at)
  IF EXISTS (SELECT 1 FROM r01a_aud x JOIN financeiro_lancamentos_v2 l ON l.id = x.registro_id, jsonb_each(to_jsonb(l)) k
              WHERE k.value IS DISTINCT FROM (x.d->k.key)
                AND NOT (k.key = ANY (CASE WHEN x.acao = 'cancelou'
                                           THEN ARRAY['cancelado', 'cancelado_em', 'cancelado_por', 'cancelado_motivo', 'updated_at']
                                           ELSE ARRAY['data_pagamento', 'status_transacao', 'updated_at'] END))) THEN
    RAISE EXCEPTION 'G4c: lancamento com campo diferente de dados_anteriores fora dos que o desfazer mudou. Migration abortada.';
  END IF;
  IF EXISTS (SELECT 1 FROM financeiro_fechamentos f WHERE f.cliente_id = c_cli AND f.ano_mes = '2026-08' AND f.status_fechamento = 'fechado') THEN
    RAISE EXCEPTION 'G6: ago/26 esta fechado. Migration abortada.';
  END IF;
  IF EXISTS (SELECT 1 FROM r01a_ext e JOIN extrato_bancario_v2 a ON a.id <> e.id AND a.cancelado_em IS NULL AND a.status <> 'ignorado'
              WHERE a.cliente_id = e.cliente_id
                AND (a.hash_movimento = e.hash_movimento
                     OR (a.conta_bancaria_id = e.conta_bancaria_id AND a.data_movimento = e.data_movimento AND a.valor = e.valor
                         AND fn_extrato_chave_doc(a.documento) IS NOT DISTINCT FROM fn_extrato_chave_doc(e.documento)
                         AND a.seq_ocorrencia = e.seq_ocorrencia))) THEN
    RAISE EXCEPTION 'G7: algum dos 93 conflita com extrato ativo (hash ou chave natural). Migration abortada.';
  END IF;
  SELECT array_agg(i.id) INTO v_ids_vazios FROM financeiro_importacoes_v2 i
   WHERE left(i.id::text, 8) = ANY (c_vazios) AND i.cliente_id = c_cli AND i.conta_bancaria_id = c_conta AND i.status = 'processada'
     AND i.created_at BETWEEN '2026-10-03 16:37:00+00' AND '2026-10-03 16:40:00+00'
     AND NOT EXISTS (SELECT 1 FROM extrato_bancario_v2 e WHERE e.importacao_id = i.id)
     AND NOT EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 l WHERE l.lote_importacao_id = i.id);
  IF coalesce(cardinality(v_ids_vazios), 0) <> 4 THEN
    RAISE EXCEPTION 'G8: os 4 cabecalhos vazios nao estao no estado medido (%). Migration abortada.', coalesce(cardinality(v_ids_vazios), 0);
  END IF;

  -- ═══ 5. BACKFILL: o antes e o gesto contrario de cada linha (o depois vem no fim) ═══
  INSERT INTO conc_import_agnaldo_01a_backfill (tabela, registro_id, campos, antes, gesto_contrario)
  SELECT 'financeiro_lancamentos_v2', l.id, ARRAY['cancelado', 'cancelado_em', 'cancelado_por', 'cancelado_motivo'], to_jsonb(l),
         format('UPDATE financeiro_lancamentos_v2 SET cancelado = %L, cancelado_em = %L, cancelado_por = %L, cancelado_motivo = %L WHERE id = %L;',
                l.cancelado, l.cancelado_em, l.cancelado_por, l.cancelado_motivo, l.id)
    FROM financeiro_lancamentos_v2 l JOIN r01a_aud x ON x.registro_id = l.id AND x.acao = 'cancelou';
  INSERT INTO conc_import_agnaldo_01a_backfill (tabela, registro_id, campos, antes, gesto_contrario)
  SELECT 'financeiro_lancamentos_v2', l.id, ARRAY['data_pagamento', 'status_transacao'], to_jsonb(l),
         format('UPDATE financeiro_lancamentos_v2 SET data_pagamento = %L, status_transacao = %L WHERE id = %L;',
                l.data_pagamento, l.status_transacao, l.id)
    FROM financeiro_lancamentos_v2 l WHERE l.id = v_subst;
  -- (o gesto contrario dos vinculos vai DEPOIS do dos lancamentos: recancelar um lancamento desfaz o vinculo com outro motivo)
  INSERT INTO conc_import_agnaldo_01a_backfill (tabela, registro_id, campos, antes, gesto_contrario)
  SELECT 'conciliacao_bancaria_itens', c.id, ARRAY['desfeito_em', 'desfeito_por', 'desfeito_motivo'], to_jsonb(c),
         format('UPDATE conciliacao_bancaria_itens SET desfeito_em = %L, desfeito_por = %L, desfeito_motivo = %L WHERE id = %L;',
                c.desfeito_em, c.desfeito_por, c.desfeito_motivo, c.id)
    FROM r01a_cbi c;
  INSERT INTO conc_import_agnaldo_01a_backfill (tabela, registro_id, campos, antes, gesto_contrario)
  SELECT 'extrato_bancario_v2', e.id, ARRAY['cancelado_em', 'cancelado_por', 'cancelado_motivo', 'status'], to_jsonb(e),
         format('UPDATE extrato_bancario_v2 SET cancelado_em = %L, cancelado_por = %L, cancelado_motivo = %L, status = %L WHERE id = %L;',
                e.cancelado_em, e.cancelado_por, e.cancelado_motivo, e.status, e.id)
    FROM r01a_ext e;
  INSERT INTO conc_import_agnaldo_01a_backfill (tabela, registro_id, campos, antes, gesto_contrario)
  SELECT 'financeiro_importacoes_v2', i.id, ARRAY['status', 'cancelado_em', 'cancelado_motivo'], to_jsonb(i),
         format('UPDATE financeiro_importacoes_v2 SET status = %L, cancelado_em = %L, cancelado_motivo = %L WHERE id = %L;',
                i.status, i.cancelado_em, i.cancelado_motivo, i.id)
    FROM financeiro_importacoes_v2 i WHERE i.id = c_imp;
  INSERT INTO conc_import_agnaldo_01a_backfill (tabela, registro_id, campos, antes, gesto_contrario)
  SELECT 'financeiro_importacoes_v2', i.id, ARRAY['(linha removida)'], to_jsonb(i),
         format('INSERT INTO financeiro_importacoes_v2 SELECT * FROM jsonb_populate_record(NULL::financeiro_importacoes_v2, %L::jsonb);', to_jsonb(i))
    FROM financeiro_importacoes_v2 i WHERE i.id = ANY (v_ids_vazios);

  -- ═══ 2. RESTAURACAO ═══
  -- lancamentos primeiro: o gatilho da OC reativa as liquidacoes quando o titulo volta a liquidado
  UPDATE financeiro_lancamentos_v2 l
     SET cancelado = (x.d->>'cancelado')::boolean, cancelado_em = (x.d->>'cancelado_em')::timestamptz,
         cancelado_por = (x.d->>'cancelado_por')::uuid, cancelado_motivo = x.d->>'cancelado_motivo'
    FROM r01a_aud x WHERE x.registro_id = l.id AND x.acao = 'cancelou';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 80 THEN RAISE EXCEPTION 'restauracao: % lancamentos reativados (esperado 80)', v_n; END IF;
  UPDATE financeiro_lancamentos_v2 l
     SET data_pagamento = (x.d->>'data_pagamento')::date, status_transacao = x.d->>'status_transacao'
    FROM r01a_aud x WHERE x.registro_id = l.id AND x.acao = 'editou';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'restauracao: % lancamento substituido (esperado 1)', v_n; END IF;
  UPDATE conciliacao_bancaria_itens c SET desfeito_em = NULL, desfeito_por = NULL, desfeito_motivo = NULL
   WHERE c.id IN (SELECT id FROM r01a_cbi);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 108 THEN RAISE EXCEPTION 'restauracao: % vinculos (esperado 108)', v_n; END IF;
  UPDATE extrato_bancario_v2 e SET cancelado_em = NULL, cancelado_por = NULL, cancelado_motivo = NULL, status = 'conciliado'
   WHERE e.id IN (SELECT id FROM r01a_ext);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 93 THEN RAISE EXCEPTION 'restauracao: % extratos (esperado 93)', v_n; END IF;
  UPDATE financeiro_importacoes_v2 i SET status = 'processada', cancelado_em = NULL, cancelado_motivo = NULL, updated_at = now()
   WHERE i.id = c_imp;

  -- ═══ 3. TRILHA ═══
  INSERT INTO conciliacao_audit_log (acao, actor_user_id, cliente_id, extrato_id, importacao_id, ano_mes, motivo, payload_antes, payload_depois)
  SELECT 'importacao_restaurada', NULL, c_cli, e.id, c_imp, to_char(e.data_movimento, 'YYYY-MM'),
         'PR-CONC-IMPORT-BANCO-AGNALDO-01A: desfazer de 03/10 16:39:18 UTC ("mes errado") revertido para agosto',
         jsonb_build_object('cancelado_em', e.cancelado_em, 'cancelado_motivo', e.cancelado_motivo, 'status', e.status),
         jsonb_build_object('cancelado_em', NULL, 'status', 'conciliado',
                            'vinculos_restaurados', (SELECT count(*) FROM r01a_cbi c WHERE c.extrato_id = e.id))
    FROM r01a_ext e;

  -- ═══ 4. LIMPEZA dos 4 cabecalhos vazios ═══
  DELETE FROM financeiro_importacoes_v2 i WHERE i.id = ANY (v_ids_vazios)
     AND NOT EXISTS (SELECT 1 FROM extrato_bancario_v2 e WHERE e.importacao_id = i.id)
     AND NOT EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 l WHERE l.lote_importacao_id = i.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 4 THEN RAISE EXCEPTION 'limpeza: % cabecalhos removidos (esperado 4)', v_n; END IF;

  -- o depois de cada linha restaurada
  UPDATE conc_import_agnaldo_01a_backfill b SET depois = to_jsonb(l) FROM financeiro_lancamentos_v2 l
   WHERE b.tabela = 'financeiro_lancamentos_v2' AND l.id = b.registro_id;
  UPDATE conc_import_agnaldo_01a_backfill b SET depois = to_jsonb(c) FROM conciliacao_bancaria_itens c
   WHERE b.tabela = 'conciliacao_bancaria_itens' AND c.id = b.registro_id;
  UPDATE conc_import_agnaldo_01a_backfill b SET depois = to_jsonb(e) FROM extrato_bancario_v2 e
   WHERE b.tabela = 'extrato_bancario_v2' AND e.id = b.registro_id;
  UPDATE conc_import_agnaldo_01a_backfill b SET depois = to_jsonb(i) FROM financeiro_importacoes_v2 i
   WHERE b.tabela = 'financeiro_importacoes_v2' AND i.id = b.registro_id;

  -- ═══ 6. GUARDAS DE DESTINO ═══
  -- 101 = os 93 + os 8 que ja' estavam ativos (6 + 2 'ignorado'; o fixture, que vem de fn_extratos_espelhados, tem 93 + 6)
  IF (SELECT count(*) FROM extrato_bancario_v2 e WHERE e.conta_bancaria_id = c_conta AND e.cancelado_em IS NULL
        AND e.data_movimento BETWEEN '2026-08-01' AND '2026-08-31') <> 101 THEN
    RAISE EXCEPTION 'D1: extratos ativos de ago/26 <> 101';
  END IF;
  IF EXISTS (SELECT 1 FROM extrato_bancario_v2 e WHERE e.importacao_id = c_imp AND e.data_movimento >= '2026-09-01' AND e.cancelado_em IS NULL) THEN
    RAISE EXCEPTION 'D2: algum dos 7 de 02/09 deixou de estar cancelado';
  END IF;
  -- os 81 lancamentos: a linha inteira = dados_anteriores, fora updated_*
  IF (SELECT count(*) FROM r01a_aud x JOIN financeiro_lancamentos_v2 l ON l.id = x.registro_id
       WHERE (to_jsonb(l) - 'updated_at' - 'updated_by') = (x.d - 'updated_at' - 'updated_by')) <> 81 THEN
    RAISE EXCEPTION 'D3: algum dos 81 lancamentos nao voltou identico a dados_anteriores (fora updated_*)';
  END IF;
  -- as 2 liquidacoes de OC, reativadas pelo gatilho do dono
  IF (SELECT count(*) FROM zoo_operacao_liquidacoes q
       WHERE q.origem = 'financeiro' AND q.estornado IS NOT TRUE
         AND ((left(q.financeiro_lancamento_id::text, 8) = '7f51a6cc' AND q.valor = 3100 AND left(q.operacao_id::text, 8) = '6a44fb9b')
           OR (left(q.financeiro_lancamento_id::text, 8) = 'f1b7f361' AND q.valor = 5943 AND left(q.operacao_id::text, 8) = 'dbda3338'))) <> 2 THEN
    RAISE EXCEPTION 'D4: as 2 liquidacoes de OC nao foram reativadas pelo gatilho';
  END IF;
  IF (SELECT count(*) FROM conciliacao_bancaria_itens c WHERE c.id IN (SELECT id FROM r01a_cbi) AND c.desfeito_em IS NULL) <> 108 THEN
    RAISE EXCEPTION 'D5: vinculos restaurados <> 108';
  END IF;
END $restaura$;