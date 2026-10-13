-- OC-CC-ABATE-01 PR 1 (Gabriel, 12–13/10/2026), SO' BANCO: o abate entra no modelo conta corrente.
--   ENTREGA   = a saida do gado, titulo sem caixa, pelo BRUTO = valor_liquido + funrural_valor (zoo_operacao_abate, realizado), em
--               1010 "Abates de Fêmeas" / 1020 "Abates de Machos" pela categoria do lote, na data da saida, no DRE.
--               ⚠ Desconto de qualidade, outros descontos e bonus ficam DENTRO do preco: NAO sao deducao (Gabriel, 13/10).
--   DEDUCAO   = o Funrural retido, linha filha da entrega: sem caixa, 2-Saídas em 5030 "Impostos e Despesas de Abates e Vendas",
--               no DRE, mesma data / fazenda / safra / favorecido da entrega; so' quando > 0. E' a UNICA deducao que nasce do abate.
--   RECEBIMENTO = o dinheiro do frigorifico, no subcentro do abate, fora do DRE (`_oc_cc_fora_do_dre`, por modelo; nao muda aqui).
--   SALDO     = recebido − (bruto − deducoes): zero quando o frigorifico paga o liquido. O lado do abate e' o da VENDA.
-- ⚠ ESTE PR NAO MUDA O NASCIMENTO (`_oc_modelo_ao_nascer` intocada: abate segue nascendo 'titulo') E NAO MIGRA NINGUEM.
--   NENHUM DADO E' ALTERADO; nenhum DDL em tabela (so' funcoes).
--
-- FUNCOES NOVAS (internas, fechadas a PUBLIC / anon / authenticated):
--   _oc_subcentro_abate(categoria)            espelho declarado de subcentroAbatePorCategoria (src/hooks/useOperacaoLiquidacao.ts);
--                                             o front ganha as categorias que faltam no PR 2.
--   _oc_cc_valor_entrega_do_lote(lote)        {bruto, liquido, funrural, qtd}: o dono do BRUTO da entrega. `_oc_valor_do_lote`
--                                             continua devolvendo o LIQUIDO (zootecnico e valor acordado). Fora do abate (e no
--                                             abate sem realizado) bruto = liquido = o total do lote e funrural = 0.
--                                             ⚠ Funrural gravado em % (funrural_fonte <> 'reais') e' RECUSADO (P0001): a conta de %
--                                             mora na lib do front e nao se copia aqui.
--   _oc_cc_deducao_sincronizar(...)           o UNICO escritor da deducao: garante / atualiza / cancela a parte
--                                             (natureza 'deducao', origem 'explicacao', chave 'deducao:<movimentacao>:<componente>')
--                                             e o lancamento dela. Cancelada, a chave vira 'deducao-cancelada:<parte_id>' (o indice
--                                             unico da chave nao olha `cancelada`).
--                                             ⚠ DIVIDA OC-CC-DEDUCAO-ORIGEM-01: a origem e' 'explicacao' porque
--                                             `zoo_operacao_partes_entrega_coerente` so' deixa UMA parte viva por movimentacao com
--                                             origem 'entrega'; uma origem 'deducao' propria pede ampliar o CHECK (DDL em tabela quente).
--
-- CORPOS POR PATCH GUARDADO POR md5 (origem, cada ancora 1x, destino); reexecutar sobre o corpo ja' corrigido nao faz nada.
-- ACL, SECURITY e search_path preservados (so' o corpo troca).
--   _oc_cc_direcao                af9520229869ff28b0e4220ae3d73fe3 -> fc24b673bc0b8d768d85d9b7531ad4da
--   _oc_cc_verbo                  5db2eded1a393793a28165996ae26218 -> eab9522ba2c5d5026427fb16e5660a50
--   _oc_cc_conta_entrega          928128aa8c5ca04471114c286cfaf3f7 -> 365d9e817cc4ad722a8e0d853531fc07
--   _oc_cc_gancho_entregas        ae7406ad3d04d36367bc1ef7b6b203d3 -> 54a60bc98f83e0a0b625560a64da7749
--   _oc_vincular_recebimento      76003144369c398fe230535b6f513910 -> a3366810662368f6a1fc0e08bf6abc70
--   oc_vincular_lancamento        5f9f5d221ccf59a8c922c853085e829e -> 659896721f642a198ecd56d44c17034b
--   oc_recebimentos_vinculaveis   69cddd2cffbefc2f6819f2188f175c9c -> 99ca6d99723397e6c363b6c2776494dd
--   oc_programar_recebimento      b7ed17a56a9a80aab2af029f2602bcac -> 92815a477a62ca9fa09f91429541c343
--   oc_salvar_lotes               80de84d14ea2f3ee9db3cf26e7f0b54f -> 3232b0a47ce8df3df64aaf480654cc83
--   oc_desfazer_explicacao        6bbca887970db9a89160a9efd3fa312e -> c9c4082f5363c83025ea9486346ebe1b
--   oc_explicar_saldo             2557f40b5cbdeacb4d2a12d995692e0c -> 70073353431593ea1e3220776787f7f8
--   oc_migrar_para_conta_corrente 22b24acbd22f4a84fa3876d8e71d7739 -> e3dae96cb4762c031f99f2cc23ce5037
--   oc_salvar_abate               4f78bb5e2157b49e8eb4812187aba2f1 -> d8052ef60309c278e86d18e1125d22b6
--   oc_sincronizar_entregas       91cdb5f80bad3335c800afdb7291e8ae -> 73ccdc3c0602d5b9d0c4dcbcb2da3f0a
--   oc_conta_corrente             578c1c664eee6d7f1927b84c1757a028 -> 6cae1d831171a7b8a9507d011f11f837
-- O QUE CADA UM GANHA:
--   helpers / gancho / vincular / vinculaveis / programar / salvar_lotes: 'abate' ao lado de 'venda'.
--   oc_sincronizar_entregas: a REGRA DE DISTRIBUICAO NAO MUDA (kg no lote fechado com os centavos na maior; cab/qtd no aberto) —
--     so' a FONTE do total do lote passa a ser o bruto do dono; a deducao usa os MESMOS pesos e o mesmo residuo da entrega dela
--     (Σ deducoes = funrural do lote, ao centavo); entram no relatorio {criadas, atualizadas, canceladas} com 'tipo': 'deducao'.
--     Em venda e compra o numero e o retorno sao os de antes.
--   oc_conta_corrente: linha 'deducao' (subtipo = componente) logo depois das entregas do dia, com efeito + no saldo; fora das
--     'explicacoes'; 'a_entregar' = acordado − entregue + deduzido; a chave 'deduzido' SO' EXISTE no abate (em venda e compra o
--     retorno e' identico ao de antes, byte a byte).
--   oc_explicar_saldo: vale no abate como na venda, MENOS o ajuste de preco, recusado com frase
--     (⚠ DIVIDA OC-CC-ABATE-AJUSTE-PRECO-01: `oc_revalorar_lote` escreve no lote, e o valor do abate mora em zoo_operacao_abate).
--   oc_desfazer_explicacao: recusa a deducao do abate (ela acompanha o acerto do abate).
--   oc_migrar_para_conta_corrente: aceita abate; o relatorio ganha 'deducoes'; o aviso de competencia vale para venda e abate.
--   oc_salvar_abate: revalorar o realizado chama o gancho (so' age em conta corrente, fora de rascunho) e devolve a versao LIDA.

CREATE OR REPLACE FUNCTION public._oc_subcentro_abate(p_categoria text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  -- Espelho de subcentroAbatePorCategoria (src/hooks/useOperacaoLiquidacao.ts). Quem mudar um, muda o outro.
  select case
    when p_categoria in ('mamotes_m', 'desmama_m', 'bezerros_m', 'garrotes', 'bois', 'touros', 'machos_adultos') then 'Abates de Machos'
    when p_categoria in ('mamotes_f', 'desmama_f', 'bezerras_f', 'novilhas', 'vacas', 'femeas_adultas') then 'Abates de Fêmeas'
  end
$function$;
REVOKE ALL ON FUNCTION public._oc_subcentro_abate(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._oc_cc_valor_entrega_do_lote(p_lote_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_l record; v_ab record; v_total numeric;
BEGIN
  /* SECURITY INVOKER, como `_oc_valor_do_lote`. O dono do BRUTO da entrega da conta corrente. */
  SELECT l.ordem, l.qtd_negociada, o.tipo_operacao INTO v_l
    FROM public.zoo_operacao_lotes l JOIN public.zoo_operacoes_comerciais o ON o.id = l.operacao_id
   WHERE l.id = p_lote_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_l.tipo_operacao = 'abate' THEN
    SELECT a.valor_liquido, a.funrural_valor, a.funrural_fonte INTO v_ab FROM public.zoo_operacao_abate a
     WHERE a.operacao_lote_id = p_lote_id AND a.cenario = 'realizado' AND a.valor_liquido IS NOT NULL
     LIMIT 1;
    IF FOUND THEN
      IF coalesce(v_ab.funrural_valor, 0) <> 0 AND coalesce(v_ab.funrural_fonte, 'reais') <> 'reais' THEN
        RAISE EXCEPTION 'Lote de ordem %: o Funrural do abate esta em %%; informe o Funrural em R$ no acerto do abate', v_l.ordem
          USING ERRCODE = 'P0001'; END IF;
      RETURN jsonb_build_object('bruto', v_ab.valor_liquido + coalesce(v_ab.funrural_valor, 0), 'liquido', v_ab.valor_liquido,
                                'funrural', coalesce(v_ab.funrural_valor, 0), 'qtd', v_l.qtd_negociada);
    END IF;
  END IF;
  v_total := (public._oc_valor_do_lote(p_lote_id)->>'total')::numeric;
  RETURN jsonb_build_object('bruto', v_total, 'liquido', v_total, 'funrural', 0, 'qtd', v_l.qtd_negociada);
END
$function$;
REVOKE ALL ON FUNCTION public._oc_cc_valor_entrega_do_lote(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._oc_cc_deducao_sincronizar(p_operacao_id uuid, p_movimentacao_id uuid, p_lote_id uuid,
  p_componente text, p_valor numeric, p_data date, p_fazenda_id uuid, p_descricao_entrega text, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_op public.zoo_operacoes_comerciais;
  v_pt public.zoo_operacao_partes;
  v_f public.financeiro_lancamentos_v2;
  v_pc public.financeiro_plano_contas;
  v_chave constant text := 'deducao:' || p_movimentacao_id || ':' || p_componente;
  v_motivo constant text := 'deducao do abate deixou de existir (OC-CC-ABATE-01)';
  v_desc text; v_tit uuid; v_parte uuid; v_seq int; v_ret jsonb;
BEGIN
  /* O UNICO escritor da deducao do abate. Chamado so' por `oc_sincronizar_entregas`, uma vez por saida ativa (valor = a parte dela)
     e uma vez por entrega cancelada (valor 0). Devolve {acao: criada|atualizada|cancelada, tipo: 'deducao', ...} ou NULL (nada mudou). */
  IF p_componente IS DISTINCT FROM 'funrural' THEN
    RAISE EXCEPTION 'Deducao do abate: componente % nao previsto', p_componente USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  SELECT * INTO v_pt FROM public.zoo_operacao_partes
   WHERE operacao_id = p_operacao_id AND chave_idempotencia = v_chave AND cancelada = false FOR UPDATE;
  IF v_pt.id IS NOT NULL THEN
    SELECT * INTO v_f FROM public.financeiro_lancamentos_v2 WHERE id = v_pt.financeiro_lancamento_id;
  END IF;

  -- (1) nao ha' mais o que deduzir, ou o lancamento da deducao morreu por fora: a parte sai (e a chave fica livre)
  IF v_pt.id IS NOT NULL AND (coalesce(p_valor, 0) <= 0 OR v_f.id IS NULL OR v_f.cancelado IS TRUE) THEN
    UPDATE public.financeiro_lancamentos_v2
       SET cancelado = true, cancelado_em = now(), cancelado_por = p_actor, cancelado_motivo = v_motivo,
           updated_at = now(), updated_by = p_actor
     WHERE id = v_pt.financeiro_lancamento_id AND cancelado IS NOT TRUE;
    UPDATE public.zoo_operacao_partes
       SET cancelada = true, cancelada_em = now(), cancelada_por = p_actor, cancelada_motivo = v_motivo, updated_at = now(),
           chave_idempotencia = 'deducao-cancelada:' || id
     WHERE id = v_pt.id;
    v_ret := jsonb_build_object('acao', 'cancelada', 'tipo', 'deducao', 'componente', p_componente, 'parte_id', v_pt.id,
               'titulo_id', v_pt.financeiro_lancamento_id, 'movimentacao_id', p_movimentacao_id, 'valor', v_pt.valor);
    IF coalesce(p_valor, 0) <= 0 THEN RETURN v_ret; END IF;
    v_pt := NULL;   -- o lancamento tinha morrido por fora e ainda ha' o que deduzir: renasce abaixo
  END IF;
  IF coalesce(p_valor, 0) <= 0 THEN RETURN NULL; END IF;

  v_desc := 'Funrural retido · ' || p_descricao_entrega;
  IF v_pt.id IS NULL THEN
    -- (2) nasce: o plano e' resolvido como a entrega resolve o dela (global, ativo)
    SELECT pc.* INTO v_pc FROM public.financeiro_plano_contas pc
     WHERE pc.cliente_id IS NULL AND pc.ativo AND pc.tipo_operacao = '2-Saídas'
       AND pc.subcentro = 'Impostos e Despesas de Abates e Vendas';
    IF v_pc.id IS NULL THEN
      RAISE EXCEPTION 'Conta da deducao do abate (Impostos e Despesas de Abates e Vendas) ausente do plano' USING ERRCODE = 'P0001'; END IF;
    INSERT INTO public.financeiro_lancamentos_v2 (
      cliente_id, fazenda_id, valor, sinal, tipo_operacao, data_competencia, data_pagamento, data_vencimento, ano_mes,
      favorecido_id, conta_bancaria_id, origem_lancamento, origem_tipo, status_transacao, cenario, sem_movimentacao_caixa,
      macro_custo, grupo_custo, centro_custo, subcentro, plano_conta_id, descricao, created_by, updated_by, safra_id)
    VALUES (
      v_op.cliente_id, coalesce(p_fazenda_id, v_op.fazenda_id), p_valor, '-1', v_pc.tipo_operacao, p_data, p_data, p_data, to_char(p_data, 'YYYY-MM'),
      v_op.contraparte_id, NULL, 'operacao_comercial', 'oc:deducao:' || p_componente, 'realizado', v_op.cenario, true,
      v_pc.macro_custo, v_pc.grupo_custo, v_pc.centro_custo, v_pc.subcentro, v_pc.id, v_desc, p_actor, p_actor,
      public.fn_safra_sugerida(v_op.cliente_id, p_data, v_pc.escopo_negocio))
    RETURNING id INTO v_tit;
    -- um lote pode ter varias saidas: cada deducao leva a sua sequencia, depois da maior viva (identidade por lote)
    SELECT coalesce(max(pt.sequencia_parcela), 0) + 1 INTO v_seq FROM public.zoo_operacao_partes pt
     WHERE pt.operacao_id = p_operacao_id AND pt.lote_id = p_lote_id AND pt.natureza = 'deducao'
       AND pt.componente = p_componente AND pt.cancelada = false;
    INSERT INTO public.zoo_operacao_partes (
      cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor, data_vencimento,
      descricao, incluso_no_total, favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro,
      lote_id, financeiro_lancamento_id, sem_movimentacao_caixa, chave_idempotencia)
    VALUES (
      v_op.cliente_id, p_operacao_id, 'explicacao', 'deducao', p_componente, v_seq, v_seq, p_valor, p_data,
      v_desc, false, v_op.contraparte_id, v_pc.id, v_pc.macro_custo,
      v_pc.grupo_custo, v_pc.centro_custo, v_pc.subcentro, p_lote_id, v_tit, true, v_chave)
    RETURNING id INTO v_parte;
    RETURN jsonb_build_object('acao', 'criada', 'tipo', 'deducao', 'componente', p_componente, 'parte_id', v_parte, 'titulo_id', v_tit,
             'movimentacao_id', p_movimentacao_id, 'data', p_data, 'valor', p_valor, 'subcentro', v_pc.subcentro);
  END IF;

  -- (3) ja' existe: acompanha valor, data e descricao da entrega
  IF v_f.valor IS DISTINCT FROM p_valor OR v_f.data_competencia IS DISTINCT FROM p_data OR v_f.descricao IS DISTINCT FROM v_desc THEN
    UPDATE public.financeiro_lancamentos_v2
       SET valor = p_valor, data_competencia = p_data, data_pagamento = p_data, data_vencimento = p_data,
           ano_mes = to_char(p_data, 'YYYY-MM'), descricao = v_desc, updated_at = now(), updated_by = p_actor
     WHERE id = v_f.id;
    UPDATE public.zoo_operacao_partes
       SET valor = p_valor, data_vencimento = p_data, descricao = v_desc, updated_at = now()
     WHERE id = v_pt.id;
    RETURN jsonb_build_object('acao', 'atualizada', 'tipo', 'deducao', 'componente', p_componente, 'parte_id', v_pt.id, 'titulo_id', v_f.id,
             'movimentacao_id', p_movimentacao_id, 'valor_anterior', v_f.valor, 'valor', p_valor,
             'data_anterior', v_f.data_competencia, 'data', p_data);
  END IF;
  RETURN NULL;
END
$function$;
REVOKE ALL ON FUNCTION public._oc_cc_deducao_sincronizar(uuid, uuid, uuid, text, numeric, date, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION pg_temp._oc_cc_abate_01_patch(p_nome text, p_origem text, p_destino text, p_pares text[])
 RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE
  v_src text; v_def text; v_novo text; i int; v_n int;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid) INTO STRICT v_src, v_def FROM pg_proc p
   WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace;
  IF md5(v_src) = p_destino THEN RETURN; END IF;   -- ja' aplicado
  IF md5(v_src) <> p_origem THEN
    RAISE EXCEPTION 'OC-CC-ABATE-01: % com corpo de origem inesperado (md5 %)', p_nome, md5(v_src); END IF;
  v_novo := v_src;
  FOR i IN 1 .. array_length(p_pares, 1) / 2 LOOP
    v_n := (length(v_novo) - length(replace(v_novo, p_pares[2 * i - 1], ''))) / length(p_pares[2 * i - 1]);
    IF v_n <> 1 THEN RAISE EXCEPTION 'OC-CC-ABATE-01: %, ancora % casa % vez(es), nao 1', p_nome, i, v_n; END IF;
    v_novo := replace(v_novo, p_pares[2 * i - 1], p_pares[2 * i]);
  END LOOP;
  IF md5(v_novo) <> p_destino THEN
    RAISE EXCEPTION 'OC-CC-ABATE-01: % com corpo de destino inesperado (md5 %)', p_nome, md5(v_novo); END IF;
  IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) <> 1 THEN
    RAISE EXCEPTION 'OC-CC-ABATE-01: %: corpo nao localizado na definicao', p_nome; END IF;
  EXECUTE replace(v_def, v_src, v_novo);
END $patch$;

SELECT pg_temp._oc_cc_abate_01_patch('_oc_cc_direcao', 'af9520229869ff28b0e4220ae3d73fe3', 'fc24b673bc0b8d768d85d9b7531ad4da', ARRAY[
$a$when 'venda' then '1-Entradas'$a$,
$b$when 'venda' then '1-Entradas' when 'abate' then '1-Entradas'$b$]);

SELECT pg_temp._oc_cc_abate_01_patch('_oc_cc_verbo', '5db2eded1a393793a28165996ae26218', 'eab9522ba2c5d5026427fb16e5660a50', ARRAY[
$a$when 'venda' then 'Venda'$a$,
$b$when 'venda' then 'Venda' when 'abate' then 'Abate'$b$]);

SELECT pg_temp._oc_cc_abate_01_patch('_oc_cc_conta_entrega', '928128aa8c5ca04471114c286cfaf3f7', '365d9e817cc4ad722a8e0d853531fc07', ARRAY[
$a$when 'compra' then public._oc_subcentro_compra(p_categoria) end$a$,
$b$when 'compra' then public._oc_subcentro_compra(p_categoria)
                     when 'abate' then public._oc_subcentro_abate(p_categoria) end$b$]);

SELECT pg_temp._oc_cc_abate_01_patch('_oc_cc_gancho_entregas', 'ae7406ad3d04d36367bc1ef7b6b203d3', '54a60bc98f83e0a0b625560a64da7749', ARRAY[
$a$v_op.tipo_operacao IN ('venda', 'compra')$a$,
$b$v_op.tipo_operacao IN ('venda', 'compra', 'abate')$b$]);

SELECT pg_temp._oc_cc_abate_01_patch('_oc_vincular_recebimento', '76003144369c398fe230535b6f513910', 'a3366810662368f6a1fc0e08bf6abc70', ARRAY[
$a$v_op.tipo_operacao NOT IN ('venda', 'compra') THEN$a$,
$b$v_op.tipo_operacao NOT IN ('venda', 'compra', 'abate') THEN$b$,
$a$'Recebimento ou pagamento de conta corrente so em venda ou compra no modelo conta corrente'$a$,
$b$'Recebimento ou pagamento de conta corrente so em venda, compra ou abate no modelo conta corrente'$b$]);

SELECT pg_temp._oc_cc_abate_01_patch('oc_vincular_lancamento', '5f9f5d221ccf59a8c922c853085e829e', '659896721f642a198ecd56d44c17034b', ARRAY[
$a$IF (v_op.tipo_operacao = 'venda' AND v_regra.tipo_operacao = '1-Entradas')$a$,
$b$IF (v_op.tipo_operacao IN ('venda', 'abate') AND v_regra.tipo_operacao = '1-Entradas')$b$]);

SELECT pg_temp._oc_cc_abate_01_patch('oc_recebimentos_vinculaveis', '69cddd2cffbefc2f6819f2188f175c9c', '99ca6d99723397e6c363b6c2776494dd', ARRAY[
$a$o.tipo_operacao IN ('venda', 'compra')$a$,
$b$o.tipo_operacao IN ('venda', 'compra', 'abate')$b$]);

SELECT pg_temp._oc_cc_abate_01_patch('oc_programar_recebimento', 'b7ed17a56a9a80aab2af029f2602bcac', '92815a477a62ca9fa09f91429541c343', ARRAY[
$a$IF v_op.tipo_operacao NOT IN ('venda', 'compra') THEN$a$,
$b$IF v_op.tipo_operacao NOT IN ('venda', 'compra', 'abate') THEN$b$,
$a$'Conta corrente so existe em venda e compra'$a$,
$b$'Conta corrente so existe em venda, compra e abate'$b$]);

SELECT pg_temp._oc_cc_abate_01_patch('oc_salvar_lotes', '80de84d14ea2f3ee9db3cf26e7f0b54f', '3232b0a47ce8df3df64aaf480654cc83', ARRAY[
$a$v_op.modelo_financeiro = 'conta_corrente' AND v_op.tipo_operacao IN ('venda', 'compra')$a$,
$b$v_op.modelo_financeiro = 'conta_corrente' AND v_op.tipo_operacao IN ('venda', 'compra', 'abate')$b$]);

SELECT pg_temp._oc_cc_abate_01_patch('oc_desfazer_explicacao', '6bbca887970db9a89160a9efd3fa312e', 'c9c4082f5363c83025ea9486346ebe1b', ARRAY[
$a$  IF NOT FOUND THEN RAISE EXCEPTION 'Explicacao nao encontrada nesta operacao' USING ERRCODE = 'P0001'; END IF;$a$,
$b$  IF NOT FOUND THEN RAISE EXCEPTION 'Explicacao nao encontrada nesta operacao' USING ERRCODE = 'P0001'; END IF;
  -- OC-CC-ABATE-01: a deducao do abate (Funrural) mora na origem 'explicacao', mas nao e' explicacao: o dono dela e' a sincronizacao
  IF v_pt.chave_idempotencia LIKE 'deducao:%' THEN
    RAISE EXCEPTION 'Dedução do abate não se desfaz: ela acompanha o acerto do abate' USING ERRCODE = 'P0001'; END IF;$b$]);

SELECT pg_temp._oc_cc_abate_01_patch('oc_explicar_saldo', '2557f40b5cbdeacb4d2a12d995692e0c', '70073353431593ea1e3220776787f7f8', ARRAY[
$a$  IF v_op.tipo_operacao NOT IN ('venda', 'compra') THEN$a$,
$b$  IF v_op.tipo_operacao NOT IN ('venda', 'compra', 'abate') THEN$b$,
$a$'Explicar a diferenca so existe em venda e compra'$a$,
$b$'Explicar a diferenca so existe em venda, compra e abate'$b$,
$a$  IF p_tipo IS NULL OR p_tipo NOT IN ('ajuste_preco', 'desconto_comercial', 'permuta_despesa', 'outra_receita', 'devolucao_comprador') THEN$a$,
$b$  -- OC-CC-ABATE-01: o valor do lote de abate mora no acerto (zoo_operacao_abate); o ajuste de preco escreve no lote e nao o alcanca
  IF v_op.tipo_operacao = 'abate' AND p_tipo = 'ajuste_preco' THEN
    RAISE EXCEPTION 'No abate o preço se corrige no acerto do abate (aba Abate), não por ajuste de preço' USING ERRCODE = 'P0001'; END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('ajuste_preco', 'desconto_comercial', 'permuta_despesa', 'outra_receita', 'devolucao_comprador') THEN$b$]);

SELECT pg_temp._oc_cc_abate_01_patch('oc_migrar_para_conta_corrente', '22b24acbd22f4a84fa3876d8e71d7739', 'e3dae96cb4762c031f99f2cc23ce5037', ARRAY[
$a$  IF v_op.tipo_operacao NOT IN ('venda', 'compra') THEN$a$,
$b$  IF v_op.tipo_operacao NOT IN ('venda', 'compra', 'abate') THEN$b$,
$a$'Conta corrente, por enquanto, so em venda e compra'$a$,
$b$'Conta corrente, por enquanto, so em venda, compra e abate'$b$,
$a$  IF v_op.tipo_operacao = 'venda' THEN$a$,
$b$  IF v_op.tipo_operacao IN ('venda', 'abate') THEN$b$,
$a$'programado', v_cc->'programado', 'saldo', v_cc->'saldo', 'situacao', v_cc->'situacao',$a$,
$b$'programado', v_cc->'programado', 'saldo', v_cc->'saldo', 'situacao', v_cc->'situacao',
                                 'deducoes', coalesce(v_cc->'deduzido', '0'::jsonb),$b$]);

SELECT pg_temp._oc_cc_abate_01_patch('oc_salvar_abate', '4f78bb5e2157b49e8eb4812187aba2f1', 'd8052ef60309c278e86d18e1125d22b6', ARRAY[
$a$    PERFORM public._oc_sync_abate_lancamento(p_operacao_id);$a$,
$b$    PERFORM public._oc_sync_abate_lancamento(p_operacao_id);
    /* OC-CC-ABATE-01: em conta corrente, revalorar o abate reflete na entrega (bruto) e na deducao (Funrural). O gancho so' age em
       conta corrente e fora de rascunho; em titulo nao faz nada. */
    PERFORM public._oc_cc_gancho_entregas(p_operacao_id);$b$,
$a$'versao', v_op.versao + 1, 'cenario', p_cenario,$a$,
$b$'versao', (SELECT o.versao FROM public.zoo_operacoes_comerciais o WHERE o.id = p_operacao_id), 'cenario', p_cenario,$b$]);

SELECT pg_temp._oc_cc_abate_01_patch('oc_sincronizar_entregas', '91cdb5f80bad3335c800afdb7291e8ae', '73ccdc3c0602d5b9d0c4dcbcb2da3f0a', ARRAY[
$a$  v_nova int;$a$,
$b$  v_nova int;
  v_d jsonb;$b$,
$a$  IF v_op.tipo_operacao NOT IN ('venda', 'compra') THEN$a$,
$b$  IF v_op.tipo_operacao NOT IN ('venda', 'compra', 'abate') THEN$b$,
$a$'Conta corrente, por enquanto, so em venda e compra'$a$,
$b$'Conta corrente, por enquanto, so em venda, compra e abate'$b$,
$a$'movimentacao_id', r.entrega_movimentacao_id, 'valor', r.valor);$a$,
$b$'movimentacao_id', r.entrega_movimentacao_id, 'valor', r.valor);
    -- OC-CC-ABATE-01: a deducao (Funrural) da entrega cancelada sai junto
    v_d := public._oc_cc_deducao_sincronizar(p_operacao_id, r.entrega_movimentacao_id, NULL, 'funrural', 0, NULL, NULL, NULL, v_actor);
    IF v_d IS NOT NULL THEN v_canceladas := v_canceladas || (v_d - 'acao'); END IF;$b$,
$a$(public._oc_valor_do_lote(lo.id)->>'total')::numeric AS total_lote,$a$,
$b$-- OC-CC-ABATE-01: o total da entrega e' o BRUTO do dono (no abate, liquido + Funrural; em venda e compra, o total do lote)
             (ve.v->>'bruto')::numeric AS total_lote, (ve.v->>'funrural')::numeric AS funrural_lote,$b$,
$a$        JOIN public.zoo_operacao_lotes lo ON lo.id = m.operacao_lote_id$a$,
$b$        JOIN public.zoo_operacao_lotes lo ON lo.id = m.operacao_lote_id
        CROSS JOIN LATERAL (SELECT public._oc_cc_valor_entrega_do_lote(lo.id) AS v) ve$b$,
$a$             ELSE round(s.total_lote * s.cab / nullif(s.qtd_negociada, 0), 2) END AS valor$a$,
$b$             ELSE round(s.total_lote * s.cab / nullif(s.qtd_negociada, 0), 2) END AS valor,
        -- OC-CC-ABATE-01: a deducao (Funrural do lote) se distribui com os MESMOS pesos e o mesmo residuo da entrega
        CASE WHEN coalesce(s.funrural_lote, 0) <= 0 THEN 0
             WHEN s.cab_lote = s.qtd_negociada
             THEN CASE WHEN s.rk_kg = 1
                       THEN s.funrural_lote - coalesce((SELECT sum(round(s2.funrural_lote * s2.kg / s2.kg_lote, 2))
                                                          FROM s s2 WHERE s2.lote_id = s.lote_id AND s2.rk_kg > 1), 0)
                       ELSE round(s.funrural_lote * s.kg / nullif(s.kg_lote, 0), 2) END
             ELSE round(s.funrural_lote * s.cab / nullif(s.qtd_negociada, 0), 2) END AS ded$b$,
$a$      v_mantidas := v_mantidas + 1;
    END IF;$a$,
$b$      v_mantidas := v_mantidas + 1;
    END IF;
    -- OC-CC-ABATE-01: no abate, o Funrural retido e' a deducao filha da entrega (5030, sem caixa, no DRE)
    IF v_op.tipo_operacao = 'abate' THEN
      v_d := public._oc_cc_deducao_sincronizar(p_operacao_id, r.movimentacao_id, r.lote_id, 'funrural', coalesce(r.ded, 0), r.data,
               coalesce(r.fazenda_id, v_op.fazenda_id),
               format('%s %s %s', public._oc_cc_verbo(v_op.tipo_operacao), lpad(r.cab::text, greatest(3, length(r.cab::text)), '0'), public._oc_sigla_categoria(r.categoria)),
               v_actor);
      IF v_d->>'acao' = 'criada' THEN v_criadas := v_criadas || (v_d - 'acao');
      ELSIF v_d->>'acao' = 'atualizada' THEN v_atualizadas := v_atualizadas || (v_d - 'acao');
      ELSIF v_d->>'acao' = 'cancelada' THEN v_canceladas := v_canceladas || (v_d - 'acao');
      END IF;
    END IF;$b$]);

SELECT pg_temp._oc_cc_abate_01_patch('oc_conta_corrente', '578c1c664eee6d7f1927b84c1757a028', '6cae1d831171a7b8a9507d011f11f837', ARRAY[
$a$    -- EXPLICACAO: soma quando reduz o que falta receber$a$,
$b$    -- DEDUCAO (OC-CC-ABATE-01): o Funrural retido pelo frigorifico, filho da entrega do abate. SOMA (reduz o que falta receber),
    -- sem caixa; vem logo depois das entregas do dia. Nao e' explicacao: o dono dela e' a sincronizacao das entregas.
    SELECT 'deducao', v.componente, v.f_comp, 0.5, v.id, v.financeiro_lancamento_id, lo.ordem, lo.categoria_negociada, NULL,
           v.f_desc, v.f_plano, NULL, round(v.f_valor, 2), NULL, 'sem_caixa', true, round(v.f_valor, 2), 0, 0, NULL
      FROM vivas v
      LEFT JOIN public.zoo_operacao_lotes lo ON lo.id = v.lote_id
     WHERE v.chave_idempotencia LIKE 'deducao:%'
    UNION ALL
    -- EXPLICACAO: soma quando reduz o que falta receber$b$,
$a$     WHERE v.origem = 'explicacao'$a$,
$b$     WHERE v.origem = 'explicacao' AND coalesce(v.chave_idempotencia, '') NOT LIKE 'deducao:%'$b$,
$a$           coalesce(sum(efeito), 0) AS saldo,$a$,
$b$           coalesce(sum(efeito), 0) AS saldo,
           coalesce(sum(mov_entrega) FILTER (WHERE tipo = 'deducao'), 0) AS deduzido,$b$,
$a$    'a_entregar', round(coalesce(op.valor_acordado, 0) - tot.entregue, 2),$a$,
$b$    'a_entregar', round(coalesce(op.valor_acordado, 0) - tot.entregue + tot.deduzido, 2),$b$,
$a$  FROM op, tot, pend;$a$,
$b$    -- OC-CC-ABATE-01: a chave so' existe no abate (em venda e compra o retorno e' o de sempre)
    || CASE WHEN op.tipo_operacao = 'abate' THEN jsonb_build_object('deduzido', round(tot.deduzido, 2)) ELSE '{}'::jsonb END
  FROM op, tot, pend;$b$]);

DROP FUNCTION pg_temp._oc_cc_abate_01_patch(text, text, text, text[]);

DO $confere$
begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
              and p.proname in ('_oc_subcentro_abate', '_oc_cc_valor_entrega_do_lote', '_oc_cc_deducao_sincronizar', '_oc_cc_gancho_entregas',
                                '_oc_vincular_recebimento')
              and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))) then
    raise exception 'OC-CC-ABATE-01: funcao interna executavel pela tela';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
              and p.proname in ('oc_vincular_lancamento', 'oc_recebimentos_vinculaveis', 'oc_programar_recebimento', 'oc_salvar_lotes',
                                'oc_desfazer_explicacao', 'oc_explicar_saldo', 'oc_migrar_para_conta_corrente', 'oc_salvar_abate',
                                'oc_sincronizar_entregas', 'oc_conta_corrente')
              and (has_function_privilege('anon', p.oid, 'EXECUTE') or not has_function_privilege('authenticated', p.oid, 'EXECUTE'))) then
    raise exception 'OC-CC-ABATE-01: ACL das funcoes publicas mudou';
  end if;
  if (select md5(p.prosrc) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = '_oc_modelo_ao_nascer')
       is distinct from 'c0e1056252382f4abbc5edf8b5604b4f' then
    raise exception 'OC-CC-ABATE-01: _oc_modelo_ao_nascer nao pode mudar neste PR';
  end if;
end
$confere$;
