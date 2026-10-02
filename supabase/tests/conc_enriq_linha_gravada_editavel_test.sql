-- PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL — teste em ROLLBACK (termina em RAISE: nada fica gravado).
-- Roda DEPOIS da migration 20261027190600. As linhas sao escolhidas na hora, FORA da sessao 8d6efeb7 (a do Gabriel), em
-- mes nao fechado. Como admin AgroinBlue (jwt claims), pelas RPCs da tela.
--   P1 linha aplicada 1:1 com proposta velha divergente: editar UM campo -> o apply muda so' esse campo no lancamento
--   P2 filho de split: editar o plano de contas -> grava; a observacao mantem o "[split: ...]" byte a byte; o
--      estado_anterior passa a fotografar o filho; o Reverter devolve
--   P3 linha NAO aplicada: o editar_proposto da' a mesma proposta de sempre (md5 contra a formula do corpo antigo)
--   P4 segunda edicao depois do alinhamento nao realinha (a primeira edicao fica)
--   P5 depois do apply, aplicado_em >= proposto_editado_em (o "alterada" zera)
--   P6 view: 114 colunas, as 2 novas no fim, valores = staging
DO $teste$
DECLARE
  c_viva constant uuid := '8d6efeb7-7c62-4a1f-bcca-32e14a386fc2';
  v_falhas text[] := '{}'; v_ok text[] := '{}';
  v_s financeiro_classificacao_staging%ROWTYPE; v_s1 financeiro_classificacao_staging%ROWTYPE;
  v_l0 financeiro_lancamentos_v2%ROWTYPE; v_l1 financeiro_lancamentos_v2%ROWTYPE;
  v_res jsonb; v_prop jsonb; v_esperado jsonb; v_novo_sub text; v_n int; v_m int; r record;
  v_diff text[];
BEGIN
  SET LOCAL lock_timeout = '3s';
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

  -- ── P3 (PRIMEIRO: o Reverter do P2 devolve uma linha a "nao aplicada"): linha NAO aplicada — a proposta resultante e' a do corpo antigo ──────────────────────────────────────────
  v_n := 0; v_m := 0;
  FOR r IN
    SELECT s.staging_id, s.update_proposto, k.patch
      FROM financeiro_classificacao_staging s
      CROSS JOIN LATERAL (SELECT (ARRAY['{"numero_documento":"P3-DOC"}', '{"observacao":"P3-OBS"}',
                                        '{"data_competencia":"2026-01-15"}'])[1 + (abs(hashtext(s.staging_id::text)) % 3)]::jsonb AS patch) k
     WHERE NOT s.aplicado AND s.sessao_id <> c_viva AND s.match_lancamento_id IS NOT NULL
     ORDER BY s.staging_id LIMIT 30
  LOOP
    v_n := v_n + 1;
    v_res := public.fn_classificacao_editar_proposto(r.staging_id, r.patch);
    v_esperado := (COALESCE(r.update_proposto, '{}'::jsonb) || r.patch)
      || jsonb_build_object('_meta', jsonb_build_object('origem_resolucao', 'manual', 'tier', 'manual', 'motor_version', 1));
    IF md5((v_res->'update_proposto')::text) = md5(v_esperado::text) THEN v_m := v_m + 1; END IF;
  END LOOP;
  IF v_n = 0 THEN v_falhas := v_falhas || 'P3: nenhuma linha nao aplicada (conjunto vazio nao e'' prova)'::text;
  ELSIF v_m <> v_n THEN v_falhas := v_falhas || format('P3: %s de %s propostas diferem da formula do corpo antigo', v_n - v_m, v_n);
  ELSE v_ok := v_ok || format('P3 (%s linhas, md5 iguais)', v_n); END IF;

  -- ── P1 + P4 + P5 ─────────────────────────────────────────────────────────────────────────────────────────────────
  SELECT s.* INTO v_s
    FROM financeiro_classificacao_staging s JOIN financeiro_lancamentos_v2 l ON l.id = s.match_lancamento_id AND NOT l.cancelado
   WHERE s.aplicado AND s.sessao_id <> c_viva AND l.origem_lancamento <> 'mesa_split'
     AND COALESCE(l.tipo_operacao, '') NOT LIKE '3-%'
     AND NULLIF(s.update_proposto->>'subcentro', '') IS NOT NULL AND s.update_proposto->>'subcentro' IS DISTINCT FROM l.subcentro
     AND EXISTS (SELECT 1 FROM financeiro_plano_contas pc WHERE pc.subcentro = s.update_proposto->>'subcentro' AND pc.ativo IS NOT FALSE)
     AND (s.proposto_editado_em IS NULL OR s.proposto_editado_em <= s.aplicado_em)
     AND NOT EXISTS (SELECT 1 FROM financeiro_fechamentos f WHERE f.cliente_id = l.cliente_id AND f.fazenda_id = l.fazenda_id
                       AND f.ano_mes = l.ano_mes AND f.status_fechamento = 'fechado')
   ORDER BY s.aplicado_em DESC LIMIT 1;
  IF NOT FOUND THEN
    v_falhas := v_falhas || 'P1: nenhuma linha aplicada com proposta velha divergente (a busca nao achou o caso)'::text;
  ELSE
    SELECT * INTO v_l0 FROM financeiro_lancamentos_v2 WHERE id = v_s.match_lancamento_id;
    v_res := public.fn_classificacao_editar_proposto(v_s.staging_id, '{"numero_documento":"P1-TESTE"}'::jsonb);
    v_prop := v_res->'update_proposto';
    IF (v_res->>'ok')::boolean IS NOT TRUE THEN v_falhas := v_falhas || ('P1: editar recusou ' || v_res::text); END IF;
    IF v_prop->>'subcentro' IS DISTINCT FROM v_l0.subcentro THEN
      v_falhas := v_falhas || format('P1: proposta nao alinhou (subcentro %s, lancamento %s)', v_prop->>'subcentro', v_l0.subcentro);
    END IF;
    IF v_prop->'_planilha' IS DISTINCT FROM v_s.update_proposto->'_planilha' THEN v_falhas := v_falhas || 'P1: _planilha mudou'::text; END IF;
    -- P4: a segunda edicao nao realinha (a primeira fica)
    v_res := public.fn_classificacao_editar_proposto(v_s.staging_id, '{"observacao":"P4-TESTE"}'::jsonb);
    IF v_res->'update_proposto'->>'numero_documento' IS DISTINCT FROM 'P1-TESTE' THEN
      v_falhas := v_falhas || ('P4: a segunda edicao perdeu a primeira: ' || COALESCE(v_res->'update_proposto'->>'numero_documento', 'NULL'));
    ELSE v_ok := v_ok || 'P4'::text; END IF;
    v_res := public.fn_classificacao_apply_row(v_s.staging_id, true);
    SELECT * INTO v_l1 FROM financeiro_lancamentos_v2 WHERE id = v_s.match_lancamento_id;
    SELECT * INTO v_s1 FROM financeiro_classificacao_staging WHERE staging_id = v_s.staging_id;
    v_diff := array_remove(ARRAY[
      CASE WHEN v_l1.subcentro IS DISTINCT FROM v_l0.subcentro THEN 'subcentro' END,
      CASE WHEN v_l1.plano_conta_id IS DISTINCT FROM v_l0.plano_conta_id THEN 'plano_conta_id' END,
      CASE WHEN v_l1.favorecido_id IS DISTINCT FROM v_l0.favorecido_id THEN 'favorecido_id' END,
      CASE WHEN v_l1.fazenda_id IS DISTINCT FROM v_l0.fazenda_id THEN 'fazenda_id' END,
      CASE WHEN v_l1.descricao IS DISTINCT FROM v_l0.descricao THEN 'descricao' END,
      CASE WHEN v_l1.safra_id IS DISTINCT FROM v_l0.safra_id THEN 'safra_id' END,
      CASE WHEN v_l1.data_competencia IS DISTINCT FROM v_l0.data_competencia THEN 'data_competencia' END,
      CASE WHEN v_l1.data_vencimento IS DISTINCT FROM v_l0.data_vencimento THEN 'data_vencimento' END,
      CASE WHEN v_l1.data_pagamento IS DISTINCT FROM v_l0.data_pagamento THEN 'data_pagamento' END,
      CASE WHEN v_l1.conta_bancaria_id IS DISTINCT FROM v_l0.conta_bancaria_id THEN 'conta_bancaria_id' END,
      CASE WHEN v_l1.conta_destino_id IS DISTINCT FROM v_l0.conta_destino_id THEN 'conta_destino_id' END,
      CASE WHEN v_l1.tipo_operacao IS DISTINCT FROM v_l0.tipo_operacao THEN 'tipo_operacao' END,
      CASE WHEN v_l1.tipo_documento IS DISTINCT FROM v_l0.tipo_documento THEN 'tipo_documento' END,
      CASE WHEN v_l1.forma_pagamento IS DISTINCT FROM v_l0.forma_pagamento THEN 'forma_pagamento' END,
      CASE WHEN v_l1.cultura IS DISTINCT FROM v_l0.cultura THEN 'cultura' END,
      CASE WHEN v_l1.fase IS DISTINCT FROM v_l0.fase THEN 'fase' END], NULL);
    IF (v_res->>'aplicado')::boolean IS NOT TRUE THEN v_falhas := v_falhas || ('P1: apply recusou ' || v_res::text);
    ELSIF v_l1.numero_documento IS DISTINCT FROM 'P1-TESTE' OR v_l1.observacao IS DISTINCT FROM 'P4-TESTE' THEN
      v_falhas := v_falhas || format('P1: os campos editados nao gravaram (doc %s, obs %s)', v_l1.numero_documento, v_l1.observacao);
    ELSIF array_length(v_diff, 1) IS NOT NULL THEN
      v_falhas := v_falhas || ('P1: o apply mexeu em campo nao editado: ' || array_to_string(v_diff, ','));
    ELSIF v_s1.estado_anterior IS DISTINCT FROM v_s.estado_anterior THEN
      v_falhas := v_falhas || 'P1: o estado_anterior mudou na regravacao'::text;
    ELSE v_ok := v_ok || format('P1 (linha %s, subcentro velho da proposta "%s" nao voltou)', v_s.excel_linha_origem,
                                v_s.update_proposto->>'subcentro'); END IF;
    -- P5
    IF v_s1.aplicado_em >= v_s1.proposto_editado_em AND NOT (v_s1.proposto_editado_em > v_s1.aplicado_em) THEN v_ok := v_ok || 'P5'::text;
    ELSE v_falhas := v_falhas || format('P5: aplicado_em %s < proposto_editado_em %s', v_s1.aplicado_em, v_s1.proposto_editado_em); END IF;
  END IF;

  -- ── P2: filho de desmembramento ──────────────────────────────────────────────────────────────────────────────────
  SELECT s.* INTO v_s
    FROM financeiro_classificacao_staging s JOIN financeiro_lancamentos_v2 l ON l.id = s.match_lancamento_id AND NOT l.cancelado
   WHERE s.aplicado AND s.sessao_id <> c_viva AND l.origem_lancamento = 'mesa_split' AND s.estado_anterior IS NULL
     AND l.observacao LIKE '%[split:%'
     AND NOT EXISTS (SELECT 1 FROM financeiro_fechamentos f WHERE f.cliente_id = l.cliente_id AND f.fazenda_id = l.fazenda_id
                       AND f.ano_mes = l.ano_mes AND f.status_fechamento = 'fechado')
   ORDER BY s.aplicado_em DESC LIMIT 1;
  IF NOT FOUND THEN
    v_falhas := v_falhas || 'P2: nenhum filho de desmembramento aplicado (a busca nao achou o caso)'::text;
  ELSE
    SELECT * INTO v_l0 FROM financeiro_lancamentos_v2 WHERE id = v_s.match_lancamento_id;
    -- outro plano de contas do mesmo tipo e atividade, sem ambiguidade no resolvedor
    SELECT pc.subcentro INTO v_novo_sub
      FROM financeiro_plano_contas pc JOIN financeiro_plano_contas atual ON atual.id = v_l0.plano_conta_id
     WHERE pc.ativo AND (pc.cliente_id = v_l0.cliente_id OR pc.cliente_id IS NULL)
       AND pc.tipo_operacao = atual.tipo_operacao AND pc.escopo_negocio = atual.escopo_negocio AND pc.subcentro <> atual.subcentro
       AND (SELECT count(*) FROM financeiro_plano_contas x WHERE x.ativo AND (x.cliente_id = v_l0.cliente_id OR x.cliente_id IS NULL)
              AND lower(trim(x.subcentro)) = lower(trim(pc.subcentro))) = 1
     ORDER BY pc.ordem_exibicao LIMIT 1;
    v_res := public.fn_classificacao_editar_proposto(v_s.staging_id, jsonb_build_object('subcentro', v_novo_sub));
    IF v_res->'update_proposto'->>'observacao' IS DISTINCT FROM v_l0.observacao THEN
      v_falhas := v_falhas || 'P2: o alinhamento nao levou a observacao do filho a proposta'::text;
    END IF;
    v_res := public.fn_classificacao_apply_row(v_s.staging_id, true);
    SELECT * INTO v_l1 FROM financeiro_lancamentos_v2 WHERE id = v_s.match_lancamento_id;
    SELECT * INTO v_s1 FROM financeiro_classificacao_staging WHERE staging_id = v_s.staging_id;
    IF (v_res->>'aplicado')::boolean IS NOT TRUE THEN v_falhas := v_falhas || ('P2: apply recusou ' || v_res::text);
    ELSIF v_l1.subcentro IS DISTINCT FROM v_novo_sub THEN
      v_falhas := v_falhas || format('P2: o plano nao gravou (%s, esperado %s)', v_l1.subcentro, v_novo_sub);
    ELSIF v_l1.observacao IS DISTINCT FROM v_l0.observacao OR md5(v_l1.observacao) <> md5(v_l0.observacao) THEN
      v_falhas := v_falhas || format('P2: a observacao do filho mudou: %s', v_l1.observacao);
    ELSIF v_s1.estado_anterior IS NULL OR v_s1.estado_anterior->>'subcentro' IS DISTINCT FROM v_l0.subcentro
          OR v_s1.estado_anterior->>'observacao' IS DISTINCT FROM v_l0.observacao THEN
      v_falhas := v_falhas || ('P2: o estado_anterior nao fotografou o filho: ' || COALESCE(v_s1.estado_anterior::text, 'NULL'));
    ELSE
      v_res := public.fn_classificacao_reverter_row(v_s.staging_id);
      SELECT * INTO v_l1 FROM financeiro_lancamentos_v2 WHERE id = v_s.match_lancamento_id;
      IF (v_res->>'ok')::boolean IS NOT TRUE OR v_l1.subcentro IS DISTINCT FROM v_l0.subcentro
         OR v_l1.plano_conta_id IS DISTINCT FROM v_l0.plano_conta_id OR v_l1.observacao IS DISTINCT FROM v_l0.observacao THEN
        v_falhas := v_falhas || format('P2: o Reverter nao devolveu o filho (%s, sub %s)', v_res::text, v_l1.subcentro);
      ELSE v_ok := v_ok || format('P2 (linha %s: %s -> %s -> volta; observacao intacta)', v_s.excel_linha_origem,
                                  v_l0.subcentro, v_novo_sub); END IF;
    END IF;
  END IF;

  -- ── P6: a view ────────────────────────────────────────────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM pg_attribute WHERE attrelid = 'public.vw_classificacao_staging_preview'::regclass AND attnum > 0 AND NOT attisdropped;
  IF v_n <> 114
     OR (SELECT attname FROM pg_attribute WHERE attrelid = 'public.vw_classificacao_staging_preview'::regclass AND attnum = 113) <> 'tem_estado_anterior'
     OR (SELECT attname FROM pg_attribute WHERE attrelid = 'public.vw_classificacao_staging_preview'::regclass AND attnum = 114) <> 'proposto_editado_em' THEN
    v_falhas := v_falhas || format('P6: a view tem %s colunas ou as novas nao estao no fim', v_n);
  END IF;
  SELECT count(*), count(*) FILTER (WHERE v.tem_estado_anterior IS DISTINCT FROM (s.estado_anterior IS NOT NULL)
                                      OR v.proposto_editado_em IS DISTINCT FROM s.proposto_editado_em)
    INTO v_n, v_m
    FROM public.vw_classificacao_staging_preview v JOIN financeiro_classificacao_staging s ON s.staging_id = v.staging_id
   WHERE v.sessao_id = '9b6785b2-251c-411f-a64b-427886e3fc97';
  IF v_n = 0 THEN v_falhas := v_falhas || 'P6: sessao de prova vazia (conjunto vazio nao e'' prova)'::text;
  ELSIF v_m > 0 THEN v_falhas := v_falhas || format('P6: %s de %s linhas com as colunas novas erradas', v_m, v_n);
  ELSE v_ok := v_ok || format('P6 (114 colunas, %s linhas conferidas)', v_n); END IF;

  IF array_length(v_falhas, 1) IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL: TODOS OK — %', array_to_string(v_ok, ' | ');
  ELSE
    RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL: HA FALHA — % || ok: %',
      array_to_string(v_falhas, ' | '), array_to_string(v_ok, ' | ');
  END IF;
END $teste$;
