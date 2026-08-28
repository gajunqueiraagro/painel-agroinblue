-- PR-OC-MOV-FORNECEDOR-01 — o fornecedor da operacao desce ao lancamento do rebanho.
--
--   O DEFEITO. `oc_registrar_movimentacao` inseria em `lancamentos` com 15 colunas e
--   NENHUMA de fornecedor. A operacao sabe quem e' a contraparte — `v_op` ja esta em
--   escopo e o mesmo INSERT usa `v_op.fazenda_id` — e nao passava adiante. Toda compra
--   vinda da Operacao Comercial nascia sem fornecedor na conferencia do Rebanho.
--
--   MEDIDO (28/08, reconferido por esta sessao):
--     36 lancamentos ligados a OC, em 16 operacoes
--     36 sem fornecedor_id — CEM POR CENTO
--     36 com o snapshot no default
--   ⚠ O briefing falava em 26; a contagem de agora deu 36. O numero cresceu entre uma
--   medicao e outra (recebimentos novos), e e' o 36 que o backfill precisa cobrir.
--
--   ⚠ POR QUE NINGUEM VIU ANTES: `fornecedor_nome_snapshot` e' NOT NULL com DEFAULT
--   '[nao informado]'. O campo nunca ficou nulo — sempre teve um texto plausivel na
--   tela. O default disfarcou o vazamento por meses.
--
--   ⚠ MESMA FAMILIA do defeito corrigido em 20260829130000 (oc_materializar_programacao
--   validava a conta bancaria e a descartava no INSERT): WRITER DA OC QUE CONHECE UM
--   VINCULO E NAO O PROPAGA. Vale como padrao de revisao: ao ler um writer da OC,
--   conferir se todo vinculo que ele TEM chega ao registro que ele CRIA.
--
--   COBERTURA — conferido, e a boa noticia e' que basta esta funcao:
--     Tres funcoes inserem em `public.lancamentos`. As outras duas
--     (`auto_create_transferencia_entrada`, `sync_transferencia_update`) sao de
--     TRANSFERENCIA entre fazendas, onde nao ha contraparte por natureza — uma delas
--     ja preenche o snapshot com o dado proprio dela. Nao e' o mesmo defeito.
--     E `oc_registrar_movimentacao` atende compra, venda E abate (o CASE de `v_tipo`),
--     entao esta correcao cobre os tres tipos, nao so a compra.
--
--   ⚠ CORPO PARTIDO DO VIGENTE, conferido por md5 ANTES da edicao:
--   29ff1127df7268fc8b940add5eb6cf58, 4661 chars.
--
--   ⚠ DESVIO DELIBERADO DO BRIEFING, com medicao. O briefing pedia: "se a contraparte
--   for nula, o default da coluna resolve — nao forcar '[nao informado]' na mao".
--   Nao da: DEFAULT so vale quando a coluna e' OMITIDA do INSERT; listada com NULL,
--   `fornecedor_nome_snapshot` estoura 23502 por ser NOT NULL. A alternativa seria
--   inserir sem a coluna e dar UPDATE depois — e `lancamentos` tem 11 triggers, NOVE
--   deles em UPDATE, incluindo `trg_audit_lancamentos` (gravaria linha de auditoria de
--   uma mudanca que nunca houve) e `trg_invalidate_zoot_cache` (invalidaria o cache
--   duas vezes por recebimento). Entre duplicar um literal e disparar nove triggers a
--   cada movimentacao, o literal custa menos. Se o default da coluna mudar, esta linha
--   precisa mudar junto — anotado aqui porque e' o unico lugar onde ele se repete.
--
--   Requer PROTO (binbcdfbisgscrifztia). NAO aplicar em producao.

CREATE OR REPLACE FUNCTION public.oc_registrar_movimentacao(
  p_operacao_id   uuid,
  p_cliente_id    uuid,
  p_lote_id       uuid,
  p_data          date,
  p_categoria     text,
  p_quantidade    integer,
  p_peso_medio_kg numeric,
  p_peso_total_kg numeric,
  p_observacao    text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_tipo text;
  v_peso jsonb;
  v_lanc uuid;
  v_link uuid;
  v_por_cab numeric;
  v_valor numeric;
  v_forn_nome text;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;                     -- guard: tenant
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;      -- guard: pertencimento
  IF v_op.rascunho OR v_op.status_comercial = 'rascunho' THEN
    RAISE EXCEPTION 'Rascunho (tecnico ou legado) nao permite movimentacao' USING ERRCODE = 'P0001'; END IF;          -- guard: rascunho
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada' USING ERRCODE = 'P0001'; END IF;   -- guard: cancelada
  IF v_op.entrega_encerrada THEN RAISE EXCEPTION 'Entrega ja encerrada' USING ERRCODE = 'P0001'; END IF;              -- guard: entrega encerrada
  IF v_op.fazenda_id IS NULL THEN RAISE EXCEPTION 'Operacao sem fazenda soberana' USING ERRCODE = 'P0001'; END IF;    -- guard: fazenda
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN RAISE EXCEPTION 'Quantidade deve ser > 0' USING ERRCODE = 'P0001'; END IF; -- guard: qtd
  -- guard: lote pertence a operacao + tenant + existe (nao removido/alheio)
  IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_lotes
                  WHERE id = p_lote_id AND operacao_id = p_operacao_id AND cliente_id = p_cliente_id) THEN
    RAISE EXCEPTION 'Lote % invalido/alheio a operacao %', p_lote_id, p_operacao_id USING ERRCODE = 'P0002'; END IF;
  v_tipo := CASE v_op.tipo_operacao WHEN 'compra' THEN 'compra' WHEN 'venda' THEN 'venda'
                                    WHEN 'abate' THEN 'abate' ELSE NULL END;
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'tipo_operacao % sem mapa zootecnico', v_op.tipo_operacao USING ERRCODE = 'P0001'; END IF; -- guard: mapa tipo
  v_peso := public._oc_conciliar_peso(p_quantidade, p_peso_medio_kg, p_peso_total_kg);  -- guard: coerencia de peso

  /* ── PR-OC-VALOR-02 · A PONTE ──────────────────────────────────────────
     O valor negociado desce ao lancamento AQUI, no momento em que o animal
     entra. Ate 24/08 esta funcao criava o lancamento sem `valor_total`, e
     por isso 555 cabecas ficaram em zero — o valor existia em
     `zoo_operacao_lotes` e nunca chegava.

     PROPORCIONAL A QUANTIDADE RECEBIDA, nunca o valor cheio do lote:
     `zoo_operacao_movimentacoes` tem UNIQUE em `movimentacao_id` mas NAO em
     `operacao_lote_id`, entao um lote aceita mais de um recebimento. O 1:1
     de hoje e circunstancial. Com o valor cheio, dois recebimentos do mesmo
     lote gerariam o dobro.

     `por_cabeca` serve os TRES criterios, inclusive `total`: o lote sempre
     tem R$/cab, porque `total / qtd` esta definido sempre que ha quantidade.
     Sem quantidade negociada, `por_cabeca` vem NULL e o lancamento nasce sem
     valor — ausencia declarada, nunca zero. */
  v_por_cab := (public._oc_valor_do_lote(p_lote_id) ->> 'por_cabeca')::numeric;
  v_valor   := CASE WHEN v_por_cab IS NULL THEN NULL
                    ELSE ROUND(v_por_cab * p_quantidade, 2) END;

  /* ── PR-OC-MOV-FORNECEDOR-01 · O FORNECEDOR DESCE JUNTO ────────────────
     A operacao SEMPRE soube quem e' a contraparte — `v_op` ja esta em escopo e
     este mesmo INSERT usa `v_op.fazenda_id`. O lancamento nascia sem ela.
     O snapshot guarda o NOME no ato: se o cadastro for renomeado depois, a
     linha do rebanho continua dizendo com quem se negociou. */
  SELECT f.nome INTO v_forn_nome
    FROM public.financeiro_fornecedores f
   WHERE f.id = v_op.contraparte_id AND f.cliente_id = p_cliente_id;

  INSERT INTO public.lancamentos (
    cliente_id, fazenda_id, tipo, categoria, quantidade, data,
    peso_medio_kg, peso_vivo_total, valor_total, cenario, status_operacional, origem_registro, created_by, updated_by, observacao,
    fornecedor_id, fornecedor_nome_snapshot)
  VALUES (
    p_cliente_id, v_op.fazenda_id, v_tipo, p_categoria, p_quantidade, p_data,
    NULLIF(v_peso->>'medio','')::numeric, NULLIF(v_peso->>'total','')::numeric, v_valor,
    'realizado', 'realizado', 'operacao_comercial', v_actor, v_actor, p_observacao,
    v_op.contraparte_id, COALESCE(v_forn_nome, '[nao informado]'))
  RETURNING id INTO v_lanc;

  INSERT INTO public.zoo_operacao_movimentacoes (cliente_id, operacao_id, operacao_lote_id, movimentacao_id, created_by)
  VALUES (p_cliente_id, p_operacao_id, p_lote_id, v_lanc, v_actor) RETURNING id INTO v_link;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'registrar_movimentacao',
          jsonb_build_object('lancamento_id', v_lanc, 'lote_id', p_lote_id, 'tipo', v_tipo, 'categoria', p_categoria, 'quantidade', p_quantidade, 'valor_total', v_valor), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'lote_id', p_lote_id, 'lancamento_id', v_lanc, 'movimentacao_id', v_link, 'valor_total', v_valor);
END;
$$;

COMMENT ON FUNCTION public.oc_registrar_movimentacao(uuid, uuid, uuid, date, text, integer, numeric, numeric, text) IS
  'PR-OC-MOV-FORNECEDOR-01: o lancamento de rebanho nasce com fornecedor_id = contraparte da operacao e fornecedor_nome_snapshot com o nome no ato. Cobre compra, venda e abate. Mantem o restante do contrato (ponte de valor de PR-OC-VALOR-02).';

-- ══════════════════════════════════════════════════════════════════════════════
-- BACKFILL DOS EXISTENTES — NAO EXECUTA COM ESTA MIGRATION.
--
--   Bloco COMENTADO de proposito: quem executa e' o Chat, com backup previo e GO do
--   Gabriel. Fica versionado aqui para o historico registrar O QUE foi feito e SOB
--   QUAL CRITERIO — um backfill que so existe no chat nao e' auditavel depois.
--
--   CRITERIO: cada lancamento ligado a uma OC recebe a contraparte DAQUELA operacao,
--   pela tabela de ligacao `zoo_operacao_movimentacoes`. Nao ha inferencia: ou a
--   operacao tem contraparte, ou a linha fica como esta.
--
--   ⚠ SO TOCA O QUE ESTA VAZIO (`fornecedor_id IS NULL`). Linha que ja tenha
--   fornecedor por qualquer outro caminho NAO e' sobrescrita — backfill corrige
--   ausencia, nunca opiniao alheia.
--   ⚠ SO ONDE HA CONTRAPARTE. Operacao sem contraparte permanece com o default do
--   snapshot; inventar nome seria pior que a ausencia declarada.
--   ⚠ SO LANCAMENTO ATIVO (`cancelado = false`). Lancamento cancelado e' HISTORIA:
--   reescrever o fornecedor dele mudaria o registro de um fato ja desfeito, e a
--   auditoria passaria a mostrar uma edicao que ninguem fez na epoca.
--   ⚠ O UPDATE dispara os nove triggers de UPDATE de `lancamentos`, entre eles
--   auditoria e invalidacao do cache zootecnico. E' esperado e desejavel: o cache
--   PRECISA ser refeito, e a auditoria registra a correcao. Rodar fora do horario de
--   uso, de uma vez, nao em lote.
--
-- BEGIN;
--   -- conferencia ANTES (esperado em 28/08: 36 linhas)
--   SELECT count(*) AS a_corrigir
--     FROM public.lancamentos l
--     JOIN public.zoo_operacao_movimentacoes m ON m.movimentacao_id = l.id
--     JOIN public.zoo_operacoes_comerciais o   ON o.id = m.operacao_id
--    WHERE l.fornecedor_id IS NULL AND o.contraparte_id IS NOT NULL AND NOT l.cancelado;
--
--   UPDATE public.lancamentos l
--      SET fornecedor_id            = o.contraparte_id,
--          fornecedor_nome_snapshot = COALESCE(f.nome, l.fornecedor_nome_snapshot)
--     FROM public.zoo_operacao_movimentacoes m
--     JOIN public.zoo_operacoes_comerciais o ON o.id = m.operacao_id
--     LEFT JOIN public.financeiro_fornecedores f ON f.id = o.contraparte_id
--    WHERE m.movimentacao_id = l.id
--      AND l.fornecedor_id IS NULL
--      AND o.contraparte_id IS NOT NULL
--      AND NOT l.cancelado;
--
--   -- conferencia DEPOIS: tem de devolver 0
--   SELECT count(*) AS restante
--     FROM public.lancamentos l
--     JOIN public.zoo_operacao_movimentacoes m ON m.movimentacao_id = l.id
--     JOIN public.zoo_operacoes_comerciais o   ON o.id = m.operacao_id
--    WHERE l.fornecedor_id IS NULL AND o.contraparte_id IS NOT NULL AND NOT l.cancelado;
-- COMMIT;
--
--   EXECUTADO no proto em 28/08, com backup previo. Resultado CONFERIDO por esta
--   sessao, apos a execucao:
--     36 lancamentos ligados a OC
--     26 com fornecedor_id E snapshot com o nome real  <- corrigidos
--     10 sem fornecedor_id, TODOS com `cancelado = true` <- preservados de proposito
--      0 ativos sem fornecedor
--   Os numeros do cabecalho ("36 sem fornecedor, cem por cento") descrevem o estado
--   ANTES; este bloco descreve o depois. Os dois ficam, porque a migration precisa
--   contar a historia inteira para quem ler daqui a um ano.
-- ══════════════════════════════════════════════════════════════════════════════
