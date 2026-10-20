-- OC-DESFAZER-PREVISTO-01b (Gabriel, 20/10/2026; mock aprovado às 19h16) — O BANCO DEVOLVE A FRASE PRONTA nas recusas da OC.
--
-- (1) FONTE ÚNICA DA MENSAGEM: toda recusa das funções abaixo sai em português, com acento, sem nome de função, valor em
--     R$ 0.000,00 e data em dd/mm/aaaa. Os ERRCODE não mudam. Quando um LANÇAMENTO trava, o id dele vai no DETAIL e o HINT leva
--     um JSON com o que a tela mostra na linha (data, valor, status, conciliado, sequência n/N, sinal).
--     · oc_cancelar_programacao, oc_cancelar_compromisso, oc_estornar_materializacao, oc_alterar_parcela_programacao,
--       oc_salvar_lotes, oc_desvincular_lancamento, oc_ajustar_valor_compromisso, oc_estornar_recebimento, oc_revalorar_lote:
--       só o texto das recusas muda (troca guardada pelo md5 de ORIGEM, como na 20261028100700; os de destino estão no teste).
-- (2) AGENDADO pede confirmação explícita: `oc_desfazer_compromisso` e `oc_reprogramar_compromisso_do_lote` ganham
--     `p_confirmar_agendado` (padrão falso). Sem ele, lançamento agendado RECUSA com frase e o id no DETAIL; na simulação ele
--     volta na lista `agendados` (o "será cancelado junto" do diálogo). O "Atualizar" deixa de bloquear agendado.
-- (3) O "ATUALIZAR COMPROMISSO" recebe o vencimento escolhido (`p_vencimento`); sem ele, o da parcela viva (como era). A
--     simulação devolve `vencimento_proposto`, e o rol vem com valores formatados ("R$ 228.400,00", nunca "228400.00").
-- (4) O DESFAZER SIMULADO não exige motivo (o diálogo simula ao abrir); a gravação continua exigindo.
-- Realizado ou conciliado NUNCA é cancelado por estes gestos (a guarda é a de sempre, de `oc_estornar_materializacao`).
-- Cada função recriada: REVOKE ALL FROM PUBLIC, anon + GRANT EXECUTE TO authenticated, service_role.

-- ── auxiliares de texto ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._fn_oc_brl(p numeric) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN p IS NULL THEN '—' ELSE
    CASE WHEN p < 0 THEN '-' ELSE '' END || 'R$ ' ||
    translate(to_char(abs(round(p, 2)), 'FM999,999,999,990.00'), ',.', '.,') END
$$;
CREATE OR REPLACE FUNCTION public._fn_oc_data(p date) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN p IS NULL THEN '—' ELSE to_char(p, 'DD/MM/YYYY') END
$$;
-- o que a tela mostra na linha do lançamento que trava (HINT): data, valor, status, conciliado, n/N, sinal
CREATE OR REPLACE FUNCTION public._fn_oc_lanc_que_trava(p_lanc uuid, p_parcela uuid) RETURNS text
LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT jsonb_build_object(
    'lancamento_id', l.id, 'data', COALESCE(l.data_pagamento, l.data_vencimento), 'valor', abs(l.valor),
    'status', l.status_transacao, 'sinal', l.sinal,
    'conciliado', (l.conciliado_em IS NOT NULL OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c
                                                           WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL)),
    'sequencia', pp.sequencia,
    'total', (SELECT count(*) FROM public.zoo_operacao_parcelas_programacao q
               WHERE q.programacao_id = pp.programacao_id AND q.status <> 'cancelada'))::text
    FROM public.financeiro_lancamentos_v2 l
    LEFT JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id = p_parcela
   WHERE l.id = p_lanc
$$;
REVOKE ALL ON FUNCTION public._fn_oc_brl(numeric), public._fn_oc_data(date), public._fn_oc_lanc_que_trava(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- ── (1) as frases: troca guardada por md5 ────────────────────────────────────────────────────────────────────────────
CREATE TABLE pg_temp._mapa (ord int, antes text, depois text);
INSERT INTO pg_temp._mapa VALUES
 (1,  '''Operacao % nao encontrada'', p_operacao_id USING', '''Operação não encontrada.'' USING'),
 (2,  '''Acesso negado ao cliente %'', p_cliente_id USING', '''Sem acesso a este cliente.'' USING'),
 (3,  '''Sem permissao nesta operacao (acesso ao cliente exigido)''', '''Sem permissão nesta operação.'''),
 (4,  '''Sem permissao nesta operacao''', '''Sem permissão nesta operação.'''),
 (5,  '''sem acesso a este registro''', '''Sem acesso a este registro.'''),
 (6,  '''Conflito de versao (esperada %, atual %)''', '''A operação mudou enquanto você trabalhava (versão %, agora %). Recarregue e tente de novo.'''),
 (7,  '''Operacao em rascunho''', '''A operação ainda é rascunho.'''),
 (8,  '''Operacao cancelada; recupere-a antes de estornar (oc_reabrir_para_estorno)''', '''A operação está cancelada. Recupere a operação antes de estornar.'''),
 (9,  '''Operacao cancelada; recupere-a antes (oc_reabrir_para_estorno)''', '''A operação está cancelada. Recupere a operação antes.'''),
 (10, '''Operacao cancelada; recupere-a antes''', '''A operação está cancelada. Recupere a operação antes.'''),
 (11, '''Cancelamento exige motivo''', '''Informe o motivo do cancelamento.'''),
 (12, '''Ajuste de valor exige motivo''', '''Informe o motivo do ajuste de valor.'''),
 (13, '''Compromisso % nao encontrado nesta operacao'', p_compromisso_id USING', '''Compromisso não encontrado nesta operação.'' USING'),
 (14, '''Compromisso % nao aceita ajuste de valor (status %)'', p_compromisso_id, v_comp.status USING', '''Este compromisso não aceita ajuste de valor (situação: %).'', v_comp.status USING'),
 (15, '''Novo valor deve ser maior que zero''', '''O novo valor tem de ser maior que zero.'''),
 (16, '''Nada a alterar''', '''Nada a alterar.'''),
 (17, '''Parcela % nao pertence a operacao %'', p_parcela_id, p_operacao_id USING', '''Esta parcela não pertence à operação.'' USING'),
 (18, '''Parcela cancelada nao pode ser alterada''', '''Parcela cancelada não pode ser alterada.'''),
 (19, '''Parcela com mais de um titulo vivo; ajuste pelo financeiro''', '''A parcela tem mais de um lançamento vivo; ajuste pelo Financeiro.'''),
 (20, '''Parcela conciliada em %; estorne a conciliacao para alterar'', to_char(v_conc,''DD/MM/YYYY'') USING ERRCODE = ''P0001''',
      '''A parcela foi conciliada em %. Desfaça a conciliação no lançamento para alterar.'', to_char(v_conc,''DD/MM/YYYY'') USING ERRCODE = ''P0001'', DETAIL = v_lanc_id::text, HINT = public._fn_oc_lanc_que_trava(v_lanc_id, v_parc.id)'),
 (21, '''Parcela % nao pode ser alterada; estorne o pagamento/recebimento'', v_st USING ERRCODE = ''P0001''',
      '''O lançamento desta parcela está % e não pode ser alterado. Desfaça o pagamento no lançamento antes.'', v_st USING ERRCODE = ''P0001'', DETAIL = v_lanc_id::text, HINT = public._fn_oc_lanc_que_trava(v_lanc_id, v_parc.id)'),
 (22, '''Conta bancaria nao pertence ao cliente''', '''A conta bancária não é deste cliente.'''),
 (23, '''Compromisso ja cancelado''', '''Este compromisso já foi cancelado.'''),
 (24, '''Cancele a programacao ativa antes de cancelar o compromisso.''', '''Cancele a programação ativa antes de cancelar o compromisso.'''),
 (25, '''Existe parcela materializada/paga; estorne antes de cancelar o compromisso.''', '''Há parcela lançada ou paga; estorne o lançamento antes de cancelar o compromisso.'''),
 (26, '''Existe parte/titulo ativo; estorne a materializacao antes de cancelar o compromisso.''', '''Há lançamento vivo neste compromisso; estorne-o antes de cancelar o compromisso.'''),
 (27, '''Programacao % nao encontrada'', p_programacao_id USING', '''Programação não encontrada.'' USING'),
 (28, '''Programacao pertence a outra operacao''', '''A programação é de outra operação.'''),
 (29, '''Programacao ja cancelada''', '''Esta programação já foi cancelada.'''),
 (30, '''Programacao nao esta ativa (estado %); renegociacao tem fluxo proprio.''', '''A programação não está ativa (situação: %).'''),
 (31, '''Programacao nao esta ativa (estado %).''', '''A programação não está ativa (situação: %).'''),
 (32, '''Estorne as materializacoes das parcelas antes de cancelar a programacao.''', '''Estorne os lançamentos das parcelas antes de cancelar a programação.'''),
 (33, '''Existe parte ativa vinculada a esta programacao; estorne a materializacao antes.''', '''Há lançamento vivo nesta programação; estorne-o antes.'''),
 (34, '''Existe titulo ativo vinculado a esta programacao; estorne a materializacao antes.''', '''Há lançamento vivo nesta programação; estorne-o antes.'''),
 (35, '''Desvincular lancamento exige motivo''', '''Informe o motivo para desvincular o lançamento.'''),
 (36, '''Lancamento % nao encontrado neste cliente'', p_lancamento_id USING', '''Lançamento não encontrado neste cliente.'' USING'),
 (37, '''Lancamento cancelado: use o Desfazer compromisso da OC''', '''Este lançamento está cancelado; use o Desfazer compromisso da operação.'''),
 (38, '''Parte % sem parcela de programacao: fora do modelo vivo, nao se desvincula por aqui'', v_parte.id', '''Este vínculo é antigo (sem parcela programada) e não se desvincula por aqui.'''),
 (39, '''O titulo tem liquidacao MANUAL ativa na OC; estorne-a antes de desvincular'' USING ERRCODE = ''P0001''',
      '''O lançamento tem liquidação manual ativa na operação; estorne-a antes de desvincular.'' USING ERRCODE = ''P0001'', DETAIL = v_l.id::text'),
 (40, '''Conta do plano % inexistente ou inativa'', p_plano_conta_id USING', '''A conta do plano não existe ou está inativa.'' USING'),
 (41, '''Conta do plano de outro cliente''', '''A conta do plano é de outro cliente.'''),
 (42, '''Direcao da conta (%) nao confere com o lancamento (%)''', '''A conta do plano (%) não confere com o tipo do lançamento (%).'''),
 (43, '''Estorno exige motivo''', '''Informe o motivo do estorno.'''),
 (44, '''Parcela % nao encontrada nesta programacao'', p_parcela_id USING', '''Parcela não encontrada nesta programação.'' USING'),
 (45, '''Parcela sem parte materializada; nada a estornar''', '''Esta parcela não tem lançamento; nada a estornar.'''),
 (46, '''Titulo da parte nao encontrado''', '''O lançamento desta parcela não foi encontrado.'''),
 (47, '''Divergencia de identidade parte/parcela/titulo; estorno bloqueado''', '''O valor do lançamento não confere com o da parcela; estorno bloqueado. Confira no Financeiro.'''),
 (48, '''Estorne a liquidacao ou conciliacao financeira antes de estornar esta materializacao.'' USING ERRCODE = ''P0001''',
      '''O lançamento de % de % já foi pago ou conciliado. Desfaça o pagamento no lançamento antes.'', public._fn_oc_brl(abs(v_fl.valor)), public._fn_oc_data(COALESCE(v_fl.data_pagamento, v_fl.data_vencimento)) USING ERRCODE = ''P0001'', DETAIL = v_fl.id::text, HINT = public._fn_oc_lanc_que_trava(v_fl.id, v_parcela.id)'),
 (49, '''A materializacao ja esta estornada''', '''Este lançamento já foi estornado.'''),
 (50, '''Estorno de recebimento exige motivo''', '''Informe o motivo do estorno do recebimento.'''),
 (51, '''A operacao nao possui recebimento ativo para estornar.''', '''A operação não tem recebimento ativo para estornar.'''),
 (52, '''Revalorizacao exige motivo''', '''Informe o motivo da revalorização.'''),
 (53, '''Lote % nao encontrado nesta operacao'', p_lote_id USING', '''Lote não encontrado nesta operação.'' USING'),
 (54, '''Lote sem quantidade negociada''', '''O lote não tem quantidade negociada.'''),
 (55, '''Operacao cancelada nao pode ser editada''', '''A operação está cancelada e não pode ser editada.'''),
 (56, '''Negociacao fechada; reabra para editar (oc_reabrir)''', '''A negociação está fechada; reabra para editar.'''),
 (57, '''Lote sem ordem valida (>=1)''', '''Há lote sem ordem válida.'''),
 (58, '''Ordem % duplicada no payload de lotes''', '''A ordem % aparece em dois lotes.'''),
 (59, '''Criterio de valor invalido (lote ordem %): %''', '''Critério de valor inválido no lote %: %.'''),
 (60, '''Quantidade do lote ordem % deve ser > 0''', '''A quantidade do lote % tem de ser maior que zero.'''),
 (61, '''Informe o peso medio do lote % (ordem %). Lote sem peso nao pode ser salvo.''', '''Informe o peso médio do lote % (ordem %). Lote sem peso não pode ser salvo.'''),
 (62, '''Valor informado do lote ordem % nao pode ser negativo''', '''O valor do lote % não pode ser negativo.'''),
 (63, '''Lote % (ordem %) tem saida ativa: %. Para remover o lote, estorne ou desvincule a saida primeiro.''', '''O lote % (ordem %) tem saída ativa: %. Para remover o lote, estorne ou desvincule a saída antes.''');

-- aplica o mapa (todos os pares presentes) só sobre o md5 de ORIGEM; já com as frases novas, pula (reaplicável); outro md5, ABORTA.
-- Depois da troca, nenhuma recusa pode sobrar com o texto antigo (sem acento): a verificação aborta se alguma escapou do mapa.
CREATE FUNCTION pg_temp._frases(p_fn regprocedure, p_origem text) RETURNS int
LANGUAGE plpgsql AS $f$
DECLARE v_src text; d text; m record; n int; v_total int := 0; v_resto text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = p_fn;
  IF md5(v_src) <> p_origem THEN
    IF v_src ~ 'RAISE EXCEPTION ''(Operação não encontrada|Sem permissão nesta operação|Informe o motivo)' THEN RETURN 0; END IF;
    RAISE EXCEPTION 'OC-DESFAZER-PREVISTO-01b: % com origem inesperada %', p_fn, md5(v_src);
  END IF;
  d := pg_get_functiondef(p_fn);
  FOR m IN SELECT * FROM pg_temp._mapa ORDER BY ord LOOP
    n := (length(d) - length(replace(d, m.antes, ''))) / length(m.antes);
    IF n > 0 THEN d := replace(d, m.antes, m.depois); v_total := v_total + n; END IF;
  END LOOP;
  IF v_total = 0 THEN RAISE EXCEPTION 'OC-DESFAZER-PREVISTO-01b: % sem frase a trocar', p_fn; END IF;
  SELECT string_agg(split_part(x, '''', 1), ' | ') INTO v_resto
    FROM regexp_split_to_table(d, 'RAISE EXCEPTION\s+''') WITH ORDINALITY AS t(x, k)
   WHERE k > 1 AND split_part(x, '''', 1) ~ '(nao |Operacao|Programacao|titulo|Lancamento|lancamento|liquidacao|materializacao|programacao|exige motivo| ja |Conflito de versao|Acesso negado|Sem permissao|recupere-a|saida|Negociacao|Criterio|invalido| medio|valida|bancaria|Revalorizacao|Divergencia|estornada|derivavel)';
  IF v_resto IS NOT NULL THEN RAISE EXCEPTION 'OC-DESFAZER-PREVISTO-01b: % ainda tem recusa crua: %', p_fn, v_resto; END IF;
  EXECUTE d;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', p_fn);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', p_fn);
  RETURN v_total;
END $f$;

SELECT pg_temp._frases('public.oc_cancelar_programacao(uuid, uuid, integer, uuid, text, uuid)'::regprocedure, '595595b2495ffcf8f211543029655338');
SELECT pg_temp._frases('public.oc_cancelar_compromisso(uuid, uuid, integer, uuid, text, uuid)'::regprocedure, 'f10a5618546d3895a9ddf30b87c49672');
SELECT pg_temp._frases('public.oc_estornar_materializacao(uuid, uuid, integer, uuid, uuid, text, uuid)'::regprocedure, '4c278e56ca80a0aa2ab9ff26e7f18c83');
SELECT pg_temp._frases('public.oc_alterar_parcela_programacao(uuid, uuid, integer, uuid, date, text, uuid)'::regprocedure, 'f49a5e85a88e30ba4645b7cf0030e330');
SELECT pg_temp._frases('public.oc_salvar_lotes(uuid, uuid, integer, jsonb)'::regprocedure, '6ae8bdb902f32ed0a23f6e8ecf4f4c78');
SELECT pg_temp._frases('public.oc_desvincular_lancamento(uuid, integer, uuid, text, uuid, boolean)'::regprocedure, '7d7e8d36bb06107064000ff0f4a96fa0');
SELECT pg_temp._frases('public.oc_ajustar_valor_compromisso(uuid, uuid, integer, uuid, numeric, text)'::regprocedure, '92bea538dc1b78c12b02b6a0590938fc');
SELECT pg_temp._frases('public.oc_estornar_recebimento(uuid, uuid, integer, text, uuid)'::regprocedure, '3646c398acc644b7271bf40e17b3fd2b');
SELECT pg_temp._frases('public.oc_revalorar_lote(uuid, uuid, integer, uuid, numeric, text)'::regprocedure, '0b59e2ee318fa08452a526eef3fbe4fa');

-- ── (2)(4) o DESFAZER: agendado com confirmação; a simulação lista o que cai junto; simulação sem motivo ─────────────────
DO $guarda$
BEGIN
  IF to_regprocedure('public.oc_desfazer_compromisso(uuid, integer, uuid, text, boolean)') IS NOT NULL THEN
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.oc_desfazer_compromisso(uuid, integer, uuid, text, boolean)'::regprocedure)
       <> 'bd6c112ab79d1efa6fe9a5468911b84f' THEN
      RAISE EXCEPTION 'OC-DESFAZER-PREVISTO-01b: oc_desfazer_compromisso com origem inesperada';
    END IF;
    DROP FUNCTION public.oc_desfazer_compromisso(uuid, integer, uuid, text, boolean);
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.oc_desfazer_compromisso(p_operacao_id uuid, p_versao integer, p_compromisso_id uuid, p_motivo text,
  p_simular boolean DEFAULT false, p_confirmar_agendado boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
DECLARE
  v_op public.zoo_operacoes_comerciais; v_comp public.zoo_operacao_compromissos; v_estorno uuid := gen_random_uuid();
  v_ver int; v_x jsonb; r record; v_titulos jsonb := '[]'::jsonb; v_agendados jsonb := '[]'::jsonb; v_progs int := 0;
  v_ret jsonb; v_motivo text; v_fl public.financeiro_lancamentos_v2; v_total int;
BEGIN
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operação não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF NOT coalesce(p_simular, false) AND (p_motivo IS NULL OR btrim(p_motivo) = '') THEN
    RAISE EXCEPTION 'Informe o motivo para desfazer.' USING ERRCODE = 'P0001'; END IF;
  -- os donos exigem motivo; a simulação (sem motivo) passa um texto que nunca é gravado
  v_motivo := COALESCE(NULLIF(btrim(p_motivo), ''), 'simulação');
  SELECT * INTO v_comp FROM public.zoo_operacao_compromissos
   WHERE id = p_compromisso_id AND operacao_id = p_operacao_id AND cliente_id = v_op.cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compromisso não encontrado nesta operação.' USING ERRCODE = 'P0001'; END IF;
  IF v_comp.status = 'cancelado' THEN RAISE EXCEPTION 'Este compromisso já foi cancelado.' USING ERRCODE = 'P0001'; END IF;
  v_ver := CASE WHEN p_simular THEN v_op.versao ELSE p_versao END;

  -- (1) FOLHA: cada parcela com título vivo é estornada pelo dono, que recusa realizado, conciliado ou com liquidação ativa
  --     (frase pronta, o lançamento no DETAIL). AGENDADO: só com a confirmação explícita; na simulação, entra na lista.
  FOR r IN
    SELECT pp.id AS parcela_id, pp.programacao_id, pp.sequencia, pp.valor, pp.vencimento
      FROM public.zoo_operacao_parcelas_programacao pp
      JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
     WHERE pr.compromisso_id = p_compromisso_id AND pr.status = 'ativa'
       AND (pp.status IN ('materializada', 'paga')
            OR EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.programacao_parcela_id = pp.id AND pt.cancelada IS NOT TRUE))
     ORDER BY pp.sequencia
  LOOP
    SELECT l.* INTO v_fl FROM public.zoo_operacao_partes pt JOIN public.financeiro_lancamentos_v2 l ON l.id = pt.financeiro_lancamento_id
     WHERE pt.programacao_parcela_id = r.parcela_id AND pt.cancelada IS NOT TRUE AND l.cancelado IS NOT TRUE LIMIT 1;
    SELECT count(*) INTO v_total FROM public.zoo_operacao_parcelas_programacao q WHERE q.programacao_id = r.programacao_id AND q.status <> 'cancelada';
    IF v_fl.id IS NOT NULL AND v_fl.status_transacao = 'agendado' AND v_fl.conciliado_em IS NULL THEN
      v_agendados := v_agendados || jsonb_build_object('lancamento_id', v_fl.id, 'sequencia', r.sequencia, 'total', v_total,
        'valor', abs(v_fl.valor), 'data', COALESCE(v_fl.data_vencimento, r.vencimento), 'sinal', v_fl.sinal);
      IF NOT coalesce(p_simular, false) AND NOT coalesce(p_confirmar_agendado, false) THEN
        RAISE EXCEPTION 'O lançamento de % com vencimento em % está agendado no banco. Confirme o cancelamento do lançamento agendado.',
          public._fn_oc_brl(abs(v_fl.valor)), public._fn_oc_data(COALESCE(v_fl.data_vencimento, r.vencimento))
          USING ERRCODE = 'P0001', DETAIL = v_fl.id::text, HINT = public._fn_oc_lanc_que_trava(v_fl.id, r.parcela_id);
      END IF;
    END IF;
    v_x := public.oc_estornar_materializacao(p_operacao_id, v_op.cliente_id, v_ver, r.programacao_id, r.parcela_id, v_motivo, v_estorno);
    v_ver := (v_x->>'operacao_versao')::int;
    v_titulos := v_titulos || jsonb_build_object('sequencia', r.sequencia, 'total', v_total, 'parcela_id', r.parcela_id,
      'titulo_id', v_x->>'titulo_id', 'valor', r.valor, 'data', COALESCE(v_fl.data_vencimento, r.vencimento),
      'status', v_fl.status_transacao, 'sinal', v_fl.sinal);
  END LOOP;

  -- (2) a programação ativa
  FOR r IN SELECT pr.id FROM public.zoo_operacao_programacoes pr
            WHERE pr.compromisso_id = p_compromisso_id AND pr.status = 'ativa' ORDER BY pr.created_at LOOP
    v_x := public.oc_cancelar_programacao(p_operacao_id, v_op.cliente_id, v_ver, r.id, v_motivo, v_estorno);
    v_ver := (v_x->>'operacao_versao')::int;
    v_progs := v_progs + 1;
  END LOOP;

  -- (3) RAIZ: o compromisso
  v_x := public.oc_cancelar_compromisso(p_operacao_id, v_op.cliente_id, v_ver, p_compromisso_id, v_motivo, v_estorno);
  v_ver := (v_x->>'operacao_versao')::int;

  v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, false), 'estorno_id', v_estorno,
    'compromisso_id', p_compromisso_id, 'natureza', v_comp.natureza, 'componente', v_comp.componente,
    'valor_total', v_comp.valor_total, 'titulos_estornados', v_titulos, 'agendados', v_agendados,
    'programacoes_canceladas', v_progs, 'operacao_id', p_operacao_id,
    'operacao_versao', CASE WHEN p_simular THEN v_op.versao ELSE v_ver END);
  IF p_simular THEN RAISE EXCEPTION 'simulação do desfazer (desfeita)' USING ERRCODE = 'OCSIM'; END IF;
  RETURN v_ret;
EXCEPTION WHEN SQLSTATE 'OCSIM' THEN RETURN v_ret;
END; $function$;
REVOKE ALL ON FUNCTION public.oc_desfazer_compromisso(uuid, integer, uuid, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_desfazer_compromisso(uuid, integer, uuid, text, boolean, boolean) TO authenticated, service_role;

-- ── (2)(3) o ATUALIZAR: vencimento escolhido, agendado com confirmação, rol com valores formatados ──────────────────────
DO $guarda$
BEGIN
  IF to_regprocedure('public.oc_reprogramar_compromisso_do_lote(uuid, uuid, integer, uuid, text, boolean)') IS NOT NULL THEN
    IF (SELECT md5(prosrc) FROM pg_proc
         WHERE oid = 'public.oc_reprogramar_compromisso_do_lote(uuid, uuid, integer, uuid, text, boolean)'::regprocedure)
       <> '2ca786fdfaad47fdcc0e5c6bb570e5c0' THEN
      RAISE EXCEPTION 'OC-DESFAZER-PREVISTO-01b: oc_reprogramar_compromisso_do_lote com origem inesperada';
    END IF;
    DROP FUNCTION public.oc_reprogramar_compromisso_do_lote(uuid, uuid, integer, uuid, text, boolean);
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.oc_reprogramar_compromisso_do_lote(p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer,
  p_lote_id uuid, p_motivo text, p_simular boolean DEFAULT false, p_vencimento date DEFAULT NULL, p_confirmar_agendado boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_actor uuid := auth.uid(); v_is_service boolean := (coalesce(auth.role(),'') = 'service_role');
  v_is_admin boolean; v_tem_acesso boolean;
  v_op public.zoo_operacoes_comerciais; v_comp public.zoo_operacao_compromissos; v_lote public.zoo_operacao_lotes;
  v_valor_novo numeric; v_valor_antigo numeric; v_rol jsonb := '[]'::jsonb; v_bloq jsonb := '[]'::jsonb; v_agend jsonb := '[]'::jsonb;
  v_venc date; v_venc_final date; v_forma text; v_conta uuid; v_prog_id uuid; v_parc_id uuid; v_nova int; r record;
  v_n_parc int := 0; v_total int; v_conc boolean; v_rotulo text;
BEGIN
  v_is_admin := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operação não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF v_op.cliente_id <> p_cliente_id THEN RAISE EXCEPTION 'Sem acesso a este cliente.' USING ERRCODE = '42501'; END IF;
  v_tem_acesso := (v_actor IS NOT NULL AND v_op.cliente_id IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN RAISE EXCEPTION 'Sem permissão nesta operação.' USING ERRCODE = '42501'; END IF;
  IF NOT p_simular AND v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'A operação mudou enquanto você trabalhava (versão %, agora %). Recarregue e tente de novo.', p_versao_esperada, v_op.versao
      USING ERRCODE = '40001'; END IF;
  IF NOT p_simular AND NULLIF(btrim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da atualização.' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_lote FROM public.zoo_operacao_lotes WHERE id = p_lote_id AND operacao_id = p_operacao_id AND cliente_id = p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Este lote não pertence à operação.' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_comp FROM public.zoo_operacao_compromissos
   WHERE lote_id = p_lote_id AND natureza = 'principal' AND status <> 'cancelado' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'O lote não tem compromisso principal ativo.' USING ERRCODE = 'P0002'; END IF;
  v_valor_novo := (public._oc_valor_do_lote(p_lote_id)->>'total')::numeric;
  IF v_valor_novo IS NULL OR v_valor_novo <= 0 THEN RAISE EXCEPTION 'O lote não tem valor para atualizar o compromisso.' USING ERRCODE = 'P0001'; END IF;
  v_valor_antigo := v_comp.valor_total;
  IF abs(v_valor_novo - v_valor_antigo) < 0.005 THEN RETURN jsonb_build_object('ok', true, 'nada_a_fazer', true, 'valor', v_valor_antigo); END IF;

  SELECT count(*) INTO v_total FROM public.zoo_operacao_parcelas_programacao pp
    JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id AND pr.compromisso_id = v_comp.id
   WHERE pp.status <> 'cancelada';

  -- parcelas vivas do compromisso e seus títulos
  FOR r IN SELECT pp.id AS parcela_id, pp.sequencia, pp.valor, pp.vencimento, pp.forma, pp.conta_bancaria_id, pp.status,
                  fl.id AS lanc_id, fl.status_transacao, fl.conciliado_em, fl.valor AS lanc_valor, fl.data_pagamento, fl.data_vencimento, fl.sinal
             FROM public.zoo_operacao_parcelas_programacao pp
             JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id AND pr.compromisso_id = v_comp.id
             LEFT JOIN public.zoo_operacao_partes pt ON pt.programacao_parcela_id = pp.id AND pt.cancelada IS NOT TRUE
             LEFT JOIN public.financeiro_lancamentos_v2 fl ON fl.id = pt.financeiro_lancamento_id
            WHERE pp.status <> 'cancelada' ORDER BY pp.sequencia LOOP
    v_conc := r.lanc_id IS NOT NULL AND (r.conciliado_em IS NOT NULL OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c
                                                                               WHERE c.lancamento_id = r.lanc_id AND c.desfeito_em IS NULL));
    IF v_conc OR r.status_transacao IN ('realizado','conciliado') THEN
      v_bloq := v_bloq || jsonb_build_object('tipo','pago', 'lancamento_id', r.lanc_id, 'sequencia', r.sequencia, 'total', v_total,
        'valor', abs(r.lanc_valor), 'data', COALESCE(r.data_pagamento, r.data_vencimento, r.vencimento), 'status', r.status_transacao,
        'conciliado', v_conc, 'sinal', r.sinal,
        'descricao', format('A parcela %s/%s de %s já foi %s. Desfaça o pagamento no lançamento antes de atualizar.',
          r.sequencia, v_total, public._fn_oc_brl(r.valor), CASE WHEN v_conc THEN 'paga e conciliada' ELSE 'paga' END));
      CONTINUE;
    END IF;
    IF r.status_transacao = 'agendado' THEN
      v_agend := v_agend || jsonb_build_object('lancamento_id', r.lanc_id, 'sequencia', r.sequencia, 'total', v_total,
        'valor', abs(r.lanc_valor), 'data', COALESCE(r.data_vencimento, r.vencimento), 'sinal', r.sinal);
    END IF;
    v_n_parc := v_n_parc + 1;
    IF v_venc IS NULL THEN v_venc := r.vencimento; v_forma := r.forma; v_conta := r.conta_bancaria_id; END IF;
    v_rotulo := CASE COALESCE(r.status_transacao, r.status) WHEN 'previsto' THEN 'prevista' WHEN 'prevista' THEN 'prevista'
                  WHEN 'programado' THEN 'programada' WHEN 'agendado' THEN 'agendada' ELSE COALESCE(r.status_transacao, r.status) END;
    v_rol := v_rol || jsonb_build_object('tipo','parcela','id', r.parcela_id,
      'descricao', format('Cancela a parcela %s/%s de %s (%s).', r.sequencia, v_total, public._fn_oc_brl(r.valor), v_rotulo));
  END LOOP;
  IF jsonb_array_length(v_bloq) > 0 THEN
    IF p_simular THEN RETURN jsonb_build_object('ok', false, 'bloqueios', v_bloq, 'rol', v_rol); END IF;
    RAISE EXCEPTION '%', v_bloq->0->>'descricao'
      USING ERRCODE = 'P0001', DETAIL = v_bloq->0->>'lancamento_id', HINT = (v_bloq->0)::text;
  END IF;
  v_venc_final := COALESCE(p_vencimento, v_venc);
  IF NOT p_simular AND jsonb_array_length(v_agend) > 0 AND NOT coalesce(p_confirmar_agendado, false) THEN
    RAISE EXCEPTION 'O lançamento de % com vencimento em % está agendado no banco. Confirme o cancelamento do lançamento agendado.',
      public._fn_oc_brl((v_agend->0->>'valor')::numeric), public._fn_oc_data((v_agend->0->>'data')::date)
      USING ERRCODE = 'P0001', DETAIL = v_agend->0->>'lancamento_id', HINT = (v_agend->0)::text;
  END IF;
  v_rol := v_rol || jsonb_build_object('tipo','compromisso','id', v_comp.id,
                 'descricao', format('O compromisso passa de %s para %s.', public._fn_oc_brl(v_valor_antigo), public._fn_oc_brl(v_valor_novo)))
               || jsonb_build_object('tipo','parcela_nova',
                 'descricao', CASE WHEN v_venc_final IS NOT NULL
                   THEN format('Nova parcela única de %s com vencimento em %s.', public._fn_oc_brl(v_valor_novo), public._fn_oc_data(v_venc_final))
                   ELSE format('Nova parcela única de %s (a programar).', public._fn_oc_brl(v_valor_novo)) END);
  IF p_simular THEN RETURN jsonb_build_object('ok', true, 'simulacao', true, 'rol', v_rol, 'valor_antigo', v_valor_antigo,
    'valor_novo', v_valor_novo, 'vencimento_proposto', v_venc, 'agendados', v_agend); END IF;

  -- cancelar títulos e partes das parcelas vivas (com data, autor e motivo), depois as parcelas e programações
  UPDATE public.financeiro_lancamentos_v2 fl SET cancelado = true, cancelado_em = now(), cancelado_por = v_actor,
         cancelado_motivo = btrim(p_motivo), updated_at = now(), updated_by = v_actor
    WHERE fl.cancelado IS NOT TRUE AND fl.id IN (
      SELECT pt.financeiro_lancamento_id FROM public.zoo_operacao_partes pt JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id = pt.programacao_parcela_id
        JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id WHERE pr.compromisso_id = v_comp.id AND pt.cancelada IS NOT TRUE);
  UPDATE public.zoo_operacao_partes pt SET cancelada = true, cancelada_em = now(), cancelada_por = v_actor, cancelada_motivo = 'reprogramado: '||btrim(p_motivo)
    WHERE pt.cancelada IS NOT TRUE AND pt.programacao_parcela_id IN (
      SELECT pp.id FROM public.zoo_operacao_parcelas_programacao pp JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id WHERE pr.compromisso_id = v_comp.id);
  UPDATE public.zoo_operacao_parcelas_programacao pp SET status = 'cancelada', updated_at = now()
    WHERE pp.status <> 'cancelada' AND pp.programacao_id IN (SELECT pr.id FROM public.zoo_operacao_programacoes pr WHERE pr.compromisso_id = v_comp.id);
  UPDATE public.zoo_operacao_programacoes SET status = 'cancelada', updated_at = now() WHERE compromisso_id = v_comp.id AND status <> 'cancelada';

  -- compromisso com o valor novo e uma parcela nova, no vencimento escolhido
  UPDATE public.zoo_operacao_compromissos SET valor_total = v_valor_novo,
         status = CASE WHEN v_venc_final IS NOT NULL THEN 'programado' ELSE 'aberto' END, updated_at = now() WHERE id = v_comp.id;
  IF v_venc_final IS NOT NULL THEN
    INSERT INTO public.zoo_operacao_programacoes (cliente_id, compromisso_id, condicoes, status)
      VALUES (p_cliente_id, v_comp.id, 'reprogramada: '||btrim(p_motivo), 'ativa') RETURNING id INTO v_prog_id;
    INSERT INTO public.zoo_operacao_parcelas_programacao (cliente_id, programacao_id, sequencia, valor, vencimento, conta_bancaria_id, forma, status)
      VALUES (p_cliente_id, v_prog_id, 1, v_valor_novo, v_venc_final, v_conta, v_forma, 'prevista') RETURNING id INTO v_parc_id;
  END IF;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'reprogramar_compromisso', to_jsonb(v_comp),
          jsonb_build_object('motivo', btrim(p_motivo), 'lote_id', p_lote_id, 'valor_antigo', v_valor_antigo, 'valor_novo', v_valor_novo,
            'vencimento', v_venc_final, 'vencimento_proposto', v_venc, 'agendados_confirmados', v_agend, 'rol', v_rol,
            'programacao_id', v_prog_id, 'parcela_id', v_parc_id, 'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1), v_actor, 'rpc');
  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;
  SELECT versao INTO v_nova FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'operacao_versao', v_nova, 'compromisso_id', v_comp.id,
    'valor_antigo', v_valor_antigo, 'valor_novo', v_valor_novo, 'vencimento', v_venc_final, 'programacao_id', v_prog_id,
    'parcela_id', v_parc_id, 'rol', v_rol);
END $function$;
REVOKE ALL ON FUNCTION public.oc_reprogramar_compromisso_do_lote(uuid, uuid, integer, uuid, text, boolean, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_reprogramar_compromisso_do_lote(uuid, uuid, integer, uuid, text, boolean, date, boolean) TO authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────────────────────────────────────────────
DO $confere$
DECLARE f regprocedure;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.oc_cancelar_programacao(uuid, uuid, integer, uuid, text, uuid)', 'public.oc_cancelar_compromisso(uuid, uuid, integer, uuid, text, uuid)',
    'public.oc_estornar_materializacao(uuid, uuid, integer, uuid, uuid, text, uuid)', 'public.oc_alterar_parcela_programacao(uuid, uuid, integer, uuid, date, text, uuid)',
    'public.oc_salvar_lotes(uuid, uuid, integer, jsonb)', 'public.oc_desvincular_lancamento(uuid, integer, uuid, text, uuid, boolean)',
    'public.oc_ajustar_valor_compromisso(uuid, uuid, integer, uuid, numeric, text)', 'public.oc_estornar_recebimento(uuid, uuid, integer, text, uuid)',
    'public.oc_revalorar_lote(uuid, uuid, integer, uuid, numeric, text)', 'public.oc_desfazer_compromisso(uuid, integer, uuid, text, boolean, boolean)',
    'public.oc_reprogramar_compromisso_do_lote(uuid, uuid, integer, uuid, text, boolean, date, boolean)']::regprocedure[] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') THEN RAISE EXCEPTION 'OC-DESFAZER-PREVISTO-01b: % executável por anon', f; END IF;
    IF NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN RAISE EXCEPTION 'OC-DESFAZER-PREVISTO-01b: % sem authenticated', f; END IF;
  END LOOP;
END $confere$;
