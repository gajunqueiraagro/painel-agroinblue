-- PR-CONC-IMPORT-BANCO-01B — gravar o extrato numa transacao so', e o desfazer que diz o que faz e recusa o que nao pode
--
-- POR QUE (M1–M5 de 03/10, PR-CONC-IMPORT-BANCO-AGNALDO-01A):
--   (1) dois movimentos IDENTICOS no mesmo arquivo derrubavam o lote: o hash nao tinha a ocorrencia, e o PostgREST manda
--       `ON CONFLICT("id") DO NOTHING` (alvo = chave primaria), entao o `ignoreDuplicates` da tela NUNCA cobriu hash nem chave
--       natural — o banco devolvia 23505 em `idx_extrato_v2_hash_unico` e a tela dizia "Extrato ja' importado";
--   (2) o cabecalho era gravado num pedido separado, antes dos movimentos: a falha deixava cabecalho 'processada' vazio
--       (4 no Agnaldo em 03/10);
--   (3) `fn_extrato_desfazer_arquivo` ja' simulava, mas a simulacao nao dizia o periodo real, contava como "enriquecido" so' o
--       `editado_manual` (17 de 80 classificados), nao falava das liquidacoes de OC, e o gesto cancelava lancamento com parte
--       de OC viva sem trava. Alem disso a funcao (SECURITY DEFINER) nao tinha guarda de tenant e tinha EXECUTE para PUBLIC.
--
-- O QUE MUDA
-- D2. `fn_extrato_importar_arquivo` (NOVA): cabecalho + movimentos numa transacao. Dedupe no banco pelos DOIS indices unicos
--     parciais (hash e chave natural) e pela repeticao dentro do proprio pacote; devolve importacao_id, inseridos, os PULADOS
--     com o motivo de cada um e os ids gravados. Sem nenhum movimento novo, nao cria cabecalho. Guarda de tenant e conta do
--     cliente; recusa escrita (`ok: false` + `frase`) sem levantar erro. O mes fechado continua como era (a gravacao do extrato
--     nunca olhou fechamento). A tela deixa de escrever em `extrato_bancario_v2` e `financeiro_importacoes_v2`.
-- D4–D6. `fn_extrato_desfazer_arquivo`: corpo INTEGRAL (origem d4b48183… guardada, destino conferido), mesma assinatura. A
--     simulacao passa a devolver tambem periodo_inicio/fim, por_mes, conciliacoes_desfeitas, crus_classificados (com
--     `plano_conta_id`), voltam_a_programado, liquidacoes_oc_estornadas e, quando ha', motivo 'oc_viva' + frase + bloqueios.
--     RECUSA (ok false, sem escrever) quando um lancamento a cancelar tem parte de OC viva; o mes fechado segue recusado como
--     antes. A execucao grava o status anterior de cada extrato em `conciliacao_audit_log.payload_antes`. Guarda de tenant
--     nova; ACL fechada (sem PUBLIC/anon; authenticated + service_role). Os campos de antes do retorno nao mudaram.

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_extrato_desfazer_arquivo(uuid, text, boolean)'::regprocedure)
       IS DISTINCT FROM 'd4b48183bfb086437a283186a648cec5' THEN
    RAISE EXCEPTION 'fn_extrato_desfazer_arquivo nao esta no corpo esperado. Migration abortada.';
  END IF;
  IF to_regprocedure('public.fn_extrato_importar_arquivo(uuid, uuid, text, text, integer, integer, numeric, date, jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'fn_extrato_importar_arquivo ja existe. Migration abortada.';
  END IF;
END $guarda$;

-- ═══════════════════ D2 — a gravacao do extrato, numa transacao ═══════════════════
CREATE FUNCTION public.fn_extrato_importar_arquivo(p_cliente_id uuid, p_conta_bancaria_id uuid, p_nome_arquivo text,
                                                  p_tipo_arquivo text, p_total_linhas integer, p_total_com_erro integer,
                                                  p_saldo_declarado numeric, p_saldo_declarado_data date, p_movimentos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
-- PR-CONC-IMPORT-BANCO-01B — O DONO DA GRAVACAO DO EXTRATO. Cabecalho e movimentos entram juntos ou nenhum entra (a funcao e'
-- uma transacao). Cada movimento de `p_movimentos` (na ordem do arquivo): {data, descricao, documento, valor, tipo, hash, seq}.
-- O hash ja' vem com a OCORRENCIA (`hashMovimento`, src/lib/financeiro/extratoHash.ts): o 2o movimento identico do arquivo tem
-- hash proprio. Dedupe pelos dois indices unicos parciais de `extrato_bancario_v2` — o que ja' existe vivo e' PULADO, com o
-- motivo, nunca erro: 'hash' (o mesmo movimento ja' esta' no extrato), 'chave_natural' (conta + data + valor + documento +
-- ocorrencia ja' estao), 'repetido_no_arquivo' (o mesmo hash duas vezes no pacote) e 'conflito' (gravado por outra sessao
-- entre a leitura e a escrita).
DECLARE
  v_conta_cliente uuid; v_imp uuid; v_novos int; v_ins int; v_pulados jsonb; v_ids jsonb;
BEGIN
  IF p_cliente_id IS NULL OR p_conta_bancaria_id IS NULL OR jsonb_typeof(p_movimentos) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_cliente_id, p_conta_bancaria_id e p_movimentos (lista) obrigatorios';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.tenant_ok(p_cliente_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;
  SELECT b.cliente_id INTO v_conta_cliente FROM financeiro_contas_bancarias b WHERE b.id = p_conta_bancaria_id;
  IF v_conta_cliente IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conta_nao_encontrada', 'frase', 'Conta bancária não encontrada.');
  END IF;
  IF v_conta_cliente <> p_cliente_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conta_de_outro_cliente',
                              'frase', 'A conta bancária selecionada não pertence ao cliente atual.');
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _ext_importar (
    i int, d date, descricao text, documento text, valor numeric, tipo text, hash text, seq int, motivo text
  ) ON COMMIT DROP;
  DELETE FROM _ext_importar WHERE true;
  INSERT INTO _ext_importar (i, d, descricao, documento, valor, tipo, hash, seq)
  SELECT (x.ord - 1)::int, (x.m->>'data')::date, x.m->>'descricao', x.m->>'documento', (x.m->>'valor')::numeric,
         x.m->>'tipo', x.m->>'hash', coalesce((x.m->>'seq')::int, 1)
    FROM jsonb_array_elements(p_movimentos) WITH ORDINALITY AS x(m, ord);

  -- o que ja' existe vivo (a mesma regua dos indices: nao cancelado e nao ignorado), e a repeticao no proprio pacote
  UPDATE _ext_importar t SET motivo = 'repetido_no_arquivo'
   WHERE EXISTS (SELECT 1 FROM _ext_importar o WHERE o.hash = t.hash AND o.i < t.i);
  UPDATE _ext_importar t SET motivo = 'hash'
   WHERE t.motivo IS NULL AND EXISTS (SELECT 1 FROM extrato_bancario_v2 e WHERE e.cliente_id = p_cliente_id
           AND e.hash_movimento = t.hash AND e.cancelado_em IS NULL AND e.status <> 'ignorado');
  UPDATE _ext_importar t SET motivo = 'chave_natural'
   WHERE t.motivo IS NULL AND EXISTS (SELECT 1 FROM extrato_bancario_v2 e WHERE e.cliente_id = p_cliente_id
           AND e.conta_bancaria_id = p_conta_bancaria_id AND e.data_movimento = t.d AND e.valor = t.valor
           AND fn_extrato_chave_doc(e.documento) IS NOT DISTINCT FROM fn_extrato_chave_doc(t.documento)
           AND e.seq_ocorrencia = t.seq AND e.cancelado_em IS NULL AND e.status <> 'ignorado');
  SELECT count(*) INTO v_novos FROM _ext_importar WHERE motivo IS NULL;

  IF v_novos > 0 THEN
    INSERT INTO financeiro_importacoes_v2 (cliente_id, fazenda_id, conta_bancaria_id, nome_arquivo, tipo_arquivo, total_linhas,
                                           total_validas, total_com_erro, status, saldo_declarado, saldo_declarado_data)
    VALUES (p_cliente_id, NULL, p_conta_bancaria_id, p_nome_arquivo, p_tipo_arquivo, p_total_linhas, v_novos, p_total_com_erro,
            'processada', p_saldo_declarado, p_saldo_declarado_data)
    RETURNING id INTO v_imp;

    WITH ins AS (
      INSERT INTO extrato_bancario_v2 (cliente_id, conta_bancaria_id, importacao_id, data_movimento, descricao, documento, valor,
                                       tipo_movimento, hash_movimento, seq_ocorrencia, status)
      SELECT p_cliente_id, p_conta_bancaria_id, v_imp, t.d, t.descricao, t.documento, t.valor, t.tipo, t.hash, t.seq, 'nao_conciliado'
        FROM _ext_importar t WHERE t.motivo IS NULL ORDER BY t.i
      ON CONFLICT DO NOTHING
      RETURNING id, hash_movimento)
    SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('hash', ins.hash_movimento, 'id', ins.id)), '[]'::jsonb)
      INTO v_ins, v_ids FROM ins;
    UPDATE _ext_importar t SET motivo = 'conflito'
     WHERE t.motivo IS NULL AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_ids) g WHERE g->>'hash' = t.hash);
    IF v_ins = 0 THEN
      DELETE FROM financeiro_importacoes_v2 WHERE id = v_imp;
      v_imp := NULL;
    ELSIF v_ins <> v_novos THEN
      UPDATE financeiro_importacoes_v2 SET total_validas = v_ins WHERE id = v_imp;
    END IF;
  ELSE
    v_ins := 0; v_ids := '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('indice', t.i, 'hash', t.hash, 'motivo', t.motivo) ORDER BY t.i), '[]'::jsonb)
    INTO v_pulados FROM _ext_importar t WHERE t.motivo IS NOT NULL;
  RETURN jsonb_build_object('ok', true, 'importacao_id', v_imp, 'inseridos', v_ins, 'pulados', v_pulados, 'ids', v_ids);
END
$function$;
REVOKE ALL ON FUNCTION public.fn_extrato_importar_arquivo(uuid, uuid, text, text, integer, integer, numeric, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_extrato_importar_arquivo(uuid, uuid, text, text, integer, integer, numeric, date, jsonb) TO authenticated, service_role;

-- ═══════════════════ D4–D6 — o desfazer do arquivo ═══════════════════
CREATE OR REPLACE FUNCTION public.fn_extrato_desfazer_arquivo(p_importacao_id uuid, p_motivo text DEFAULT 'arquivo_desfeito'::text, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- PR-CONC-IMPORT-BANCO-01B: a SIMULACAO passa a dizer tudo o que o gesto faz (periodo real, movimentos por mes, conciliacoes,
-- lancamentos CLASSIFICADOS que serao cancelados, os que voltam a programado, liquidacoes de OC estornadas) e o gesto RECUSA,
-- com a frase, quando um lancamento a cancelar tem parte de OC viva (alem do mes fechado de sempre). A execucao grava o status
-- anterior de cada extrato em `conciliacao_audit_log.payload_antes`. Os campos de antes do retorno nao mudaram.
DECLARE
  v_imp record; v_uid uuid := auth.uid(); v_agora timestamptz := now();
  v_meses text[]; v_fechado text;
  v_ext record; v_cbi record; v_lan record; v_aud jsonb;
  n_ext int := 0; n_cru int := 0; n_cru_edit int := 0; n_subst int := 0; n_subst_audit int := 0;
  n_manual int := 0; n_sem_par int := 0; n_multi int := 0;
  v_ids_cru uuid[] := '{}'; v_ids_subst uuid[] := '{}'; v_ids_manual uuid[] := '{}';
  n_cru_class int := 0; v_ids_programado uuid[] := '{}'; v_bloqueios jsonb; v_frase text; v_liq jsonb;
BEGIN
  SELECT * INTO v_imp FROM financeiro_importacoes_v2 WHERE id = p_importacao_id;
  IF v_imp.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'importacao_nao_encontrada'); END IF;
  -- PR-CONC-IMPORT-BANCO-01B: so' quem pode ver o cliente desfaz (a funcao e' SECURITY DEFINER; nao havia guarda)
  IF v_uid IS NOT NULL AND NOT public.tenant_ok(v_imp.cliente_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;
  IF v_imp.status = 'cancelada' OR v_imp.cancelado_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'importacao_ja_cancelada');
  END IF;

  SELECT array_agg(DISTINCT to_char(data_movimento,'YYYY-MM')) INTO v_meses
    FROM extrato_bancario_v2 WHERE importacao_id = p_importacao_id AND cancelado_em IS NULL;
  SELECT string_agg(f.ano_mes, ', ') INTO v_fechado
    FROM financeiro_fechamentos f
   WHERE f.cliente_id = v_imp.cliente_id AND f.status_fechamento = 'fechado' AND f.ano_mes = ANY(COALESCE(v_meses,'{}'));
  IF v_fechado IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'mes_fechado', 'meses', v_fechado);
  END IF;

  -- PR-CONC-IMPORT-BANCO-01B (D5): o lancamento cru que o gesto CANCELARIA e' titulo de OC (parte viva) — o cancelamento
  -- passaria por cima da trava de titulo de OC. Recusa, com o lancamento, a OC e onde resolver.
  SELECT jsonb_agg(jsonb_build_object('lancamento_id', l.id, 'descricao', l.descricao, 'valor', l.valor, 'data_pagamento', l.data_pagamento,
                                      'operacao_id', o.id, 'oc', CASE WHEN nullif(btrim(o.numero_documento), '') IS NOT NULL
                                                                      THEN 'OC ' || btrim(o.numero_documento)
                                                                      ELSE 'OC de ' || to_char(o.data_operacao, 'DD/MM/YYYY') END)
                   ORDER BY l.data_pagamento, l.id)
    INTO v_bloqueios
    FROM extrato_bancario_v2 e
    JOIN conciliacao_bancaria_itens c ON c.extrato_id = e.id AND c.desfeito_em IS NULL AND c.tipo_aprovacao = 'ofx_cru'
    JOIN financeiro_lancamentos_v2 l ON l.id = c.lancamento_id AND l.cancelado IS DISTINCT FROM true
    JOIN zoo_operacao_partes p ON p.financeiro_lancamento_id = l.id AND p.cancelada IS NOT TRUE
    JOIN zoo_operacoes_comerciais o ON o.id = p.operacao_id
   WHERE e.importacao_id = p_importacao_id AND e.cancelado_em IS NULL;
  IF v_bloqueios IS NOT NULL THEN
    v_frase := format('O lançamento "%s" (R$ %s, %s) está ligado à %s: desfaça o vínculo na OC antes.',
      coalesce(nullif(btrim(v_bloqueios->0->>'descricao'), ''), 'sem descrição'),
      replace(replace(replace(to_char(abs((v_bloqueios->0->>'valor')::numeric), 'FM999,999,999,990.00'), ',', 'X'), '.', ','), 'X', '.'),
      coalesce(to_char((v_bloqueios->0->>'data_pagamento')::date, 'DD/MM/YYYY'), 'sem data'),
      v_bloqueios->0->>'oc')
      || CASE WHEN jsonb_array_length(v_bloqueios) > 1
              THEN format(' E mais %s lançamento(s) ligado(s) a OC.', jsonb_array_length(v_bloqueios) - 1) ELSE '' END;
    IF NOT p_simular THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'oc_viva', 'frase', v_frase, 'bloqueios', v_bloqueios);
    END IF;
  END IF;

  FOR v_ext IN SELECT * FROM extrato_bancario_v2 WHERE importacao_id = p_importacao_id AND cancelado_em IS NULL LOOP
    n_ext := n_ext + 1;
    SELECT count(*) INTO n_multi FROM conciliacao_bancaria_itens WHERE extrato_id = v_ext.id AND desfeito_em IS NULL;
    IF n_multi = 0 THEN n_sem_par := n_sem_par + 1; END IF;

    FOR v_cbi IN SELECT * FROM conciliacao_bancaria_itens WHERE extrato_id = v_ext.id AND desfeito_em IS NULL LOOP
      SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = v_cbi.lancamento_id;

      IF v_cbi.tipo_aprovacao = 'ofx_cru' THEN
        n_cru := n_cru + 1;
        IF COALESCE(v_lan.editado_manual,false) THEN n_cru_edit := n_cru_edit + 1; END IF;
        IF v_lan.plano_conta_id IS NOT NULL THEN n_cru_class := n_cru_class + 1; END IF;
        v_ids_cru := v_ids_cru || v_lan.id;
        IF NOT p_simular THEN
          UPDATE conciliacao_bancaria_itens SET desfeito_em = v_agora, desfeito_por = v_uid, desfeito_motivo = p_motivo WHERE id = v_cbi.id;
          UPDATE financeiro_lancamentos_v2
             SET cancelado = true, cancelado_em = v_agora, cancelado_por = v_uid,
                 cancelado_motivo = 'arquivo desfeito: ' || COALESCE(v_imp.nome_arquivo,'?'),
                 updated_by = v_uid, updated_at = v_agora
           WHERE id = v_lan.id AND cancelado IS DISTINCT FROM true;
        END IF;

      ELSIF v_cbi.tipo_aprovacao = 'ofx_substituiu' THEN
        n_subst := n_subst + 1;
        v_ids_subst := v_ids_subst || v_lan.id;
        SELECT a.dados_anteriores INTO v_aud FROM audit_log a
         WHERE a.registro_id = v_lan.id AND a.tabela_origem = 'financeiro_lancamentos_v2'
           AND a.created_at BETWEEN v_cbi.created_at - interval '5 seconds' AND v_cbi.created_at + interval '5 seconds'
         ORDER BY a.created_at LIMIT 1;
        IF v_aud IS NOT NULL THEN n_subst_audit := n_subst_audit + 1; END IF;
        -- volta a um status que nao e' liquidado (programado/agendado): o que a simulacao chama de "volta a programado"
        IF v_aud IS NOT NULL AND COALESCE(v_aud->>'status_transacao', v_lan.status_transacao) NOT IN ('realizado', 'conciliado')
           AND v_lan.status_transacao IN ('realizado', 'conciliado') THEN
          v_ids_programado := v_ids_programado || v_lan.id;
        END IF;
        IF NOT p_simular THEN
          UPDATE conciliacao_bancaria_itens SET desfeito_em = v_agora, desfeito_por = v_uid, desfeito_motivo = p_motivo WHERE id = v_cbi.id;
          IF v_aud IS NOT NULL THEN
            UPDATE financeiro_lancamentos_v2
               SET data_pagamento = (v_aud->>'data_pagamento')::date,
                   data_vencimento = (v_aud->>'data_vencimento')::date,
                   valor = (v_aud->>'valor')::numeric,
                   status_transacao = COALESCE(v_aud->>'status_transacao', status_transacao),
                   updated_by = v_uid, updated_at = v_agora
             WHERE id = v_lan.id;
          ELSE
            UPDATE financeiro_lancamentos_v2
               SET data_pagamento = v_cbi.snapshot_lancamento_data,
                   valor = COALESCE(v_cbi.snapshot_lancamento_valor, valor),
                   updated_by = v_uid, updated_at = v_agora
             WHERE id = v_lan.id;
          END IF;
        END IF;

      ELSE
        n_manual := n_manual + 1;
        v_ids_manual := v_ids_manual || v_lan.id;
        IF NOT p_simular THEN
          UPDATE conciliacao_bancaria_itens SET desfeito_em = v_agora, desfeito_por = v_uid, desfeito_motivo = p_motivo WHERE id = v_cbi.id;
        END IF;
      END IF;
    END LOOP;

    IF NOT p_simular THEN
      UPDATE extrato_bancario_v2 SET status = 'nao_conciliado', cancelado_em = v_agora, cancelado_por = v_uid, cancelado_motivo = p_motivo, updated_at = v_agora WHERE id = v_ext.id;
      -- PR-CONC-IMPORT-BANCO-01B (D6): o status ANTERIOR do extrato fica registrado (o UPDATE acima o sobrescreve)
      INSERT INTO conciliacao_audit_log (acao, actor_user_id, cliente_id, extrato_id, importacao_id, ano_mes, motivo, payload_antes, payload_depois)
      VALUES ('importacao_revertida', v_uid, v_imp.cliente_id, v_ext.id, p_importacao_id, to_char(v_ext.data_movimento,'YYYY-MM'), p_motivo,
              jsonb_build_object('status', v_ext.status, 'cancelado_em', v_ext.cancelado_em),
              jsonb_build_object('vinculos_desfeitos', n_multi));
    END IF;
  END LOOP;

  -- as liquidacoes automaticas de OC que o gatilho do dono vai estornar: titulo que deixa de estar liquidado (cru cancelado, ou
  -- substituido que volta a programado)
  SELECT jsonb_agg(jsonb_build_object('liquidacao_id', q.id, 'operacao_id', q.operacao_id, 'lancamento_id', q.financeiro_lancamento_id,
                                      'valor', q.valor) ORDER BY q.valor DESC, q.id)
    INTO v_liq
    FROM zoo_operacao_liquidacoes q
   WHERE q.origem = 'financeiro' AND q.estornado IS NOT TRUE
     AND q.financeiro_lancamento_id = ANY (v_ids_cru || v_ids_programado);

  IF NOT p_simular THEN
    UPDATE financeiro_importacoes_v2 SET status = 'cancelada', cancelado_em = v_agora, cancelado_motivo = p_motivo, updated_at = v_agora WHERE id = p_importacao_id;
  END IF;

  RETURN jsonb_build_object('ok', v_bloqueios IS NULL, 'simulado', p_simular, 'arquivo', v_imp.nome_arquivo, 'meses', v_meses,
    'extratos', n_ext, 'sem_par', n_sem_par,
    'crus_cancelados', n_cru, 'crus_enriquecidos', n_cru_edit,
    'substituidos_restaurados', n_subst, 'substituidos_com_audit', n_subst_audit,
    'vinculos_manuais_desfeitos', n_manual,
    'ids_cru', to_jsonb(v_ids_cru), 'ids_subst', to_jsonb(v_ids_subst), 'ids_manual', to_jsonb(v_ids_manual))
    -- PR-CONC-IMPORT-BANCO-01B: o que a simulacao passou a informar (acrescentado, os campos de antes nao mudam; nulos fora)
    || jsonb_strip_nulls(jsonb_build_object(
    'periodo_inicio', (SELECT min(e.data_movimento) FROM extrato_bancario_v2 e WHERE e.importacao_id = p_importacao_id AND (e.cancelado_em IS NULL OR e.cancelado_em = v_agora)),
    'periodo_fim', (SELECT max(e.data_movimento) FROM extrato_bancario_v2 e WHERE e.importacao_id = p_importacao_id AND (e.cancelado_em IS NULL OR e.cancelado_em = v_agora)),
    'por_mes', coalesce((SELECT jsonb_agg(jsonb_build_object('mes', z.mes, 'qtde', z.qtde) ORDER BY z.mes)
                           FROM (SELECT to_char(e.data_movimento, 'YYYY-MM') AS mes, count(*) AS qtde FROM extrato_bancario_v2 e
                                  WHERE e.importacao_id = p_importacao_id AND (e.cancelado_em IS NULL OR e.cancelado_em = v_agora)
                                  GROUP BY 1) z), '[]'::jsonb),
    'conciliacoes_desfeitas', n_cru + n_subst + n_manual,
    'crus_classificados', n_cru_class,
    'voltam_a_programado', cardinality(v_ids_programado),
    'liquidacoes_oc_estornadas', coalesce(v_liq, '[]'::jsonb),
    'motivo', CASE WHEN v_bloqueios IS NOT NULL THEN 'oc_viva' END,
    'frase', v_frase,
    'bloqueios', v_bloqueios));
END
$function$;
REVOKE ALL ON FUNCTION public.fn_extrato_desfazer_arquivo(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_extrato_desfazer_arquivo(uuid, text, boolean) TO authenticated, service_role;

DO $guarda$
DECLARE r record; f text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_extrato_desfazer_arquivo(uuid, text, boolean)'::regprocedure)
       IS DISTINCT FROM '0e3c3b5aa1efd5114fb9502a04c169c4' THEN
    RAISE EXCEPTION 'fn_extrato_desfazer_arquivo: corpo de destino inesperado';
  END IF;
  FOREACH f IN ARRAY ARRAY['public.fn_extrato_desfazer_arquivo(uuid, text, boolean)',
                           'public.fn_extrato_importar_arquivo(uuid, uuid, text, text, integer, integer, numeric, date, jsonb)'] LOOP
    SELECT p.oid, p.prosecdef INTO r FROM pg_proc p WHERE p.oid = f::regprocedure;
    IF NOT r.prosecdef OR has_function_privilege('anon', r.oid, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = r.oid)) a WHERE a.grantee = 0) THEN
      RAISE EXCEPTION '%: ACL/SECURITY inesperados', f;
    END IF;
  END LOOP;
END $guarda$;