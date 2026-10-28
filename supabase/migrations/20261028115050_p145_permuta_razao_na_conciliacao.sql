-- P145 (Gabriel 28/10/2026 09:42, decisão A — "razão inteiro", 27/10) — a Conciliação da conta PERMUTA conta o razão DELA, com os
-- lançamentos "sem movimentação de caixa" da própria conta. Numa conta de barter todo movimento é sem caixa por definição; o filtro geral
-- (`sem_movimentacao_caixa = false`) esvaziava a conta e deixava só a perna de caixa — NJ, "Permuta · Cooperativa Agropecuaria de
-- Parapua 1", mar/26: a Conciliação mostrava −869,29 (a transferência) contra entradas e saídas de barter de R$ 152.390,00 no mês.
-- ⚠ UM LUGAR SÓ: `fn_caixa_sistema_pontas` — o dono do movimento do sistema por conta, lido pela Conciliação (`_fn_conciliacao_dias_conta`
--   → `fn_conciliacao_resumo_mes`) e pela Conferência (`fn_extratos_espelhados`). A linha do filtro passa a deixar entrar o sem caixa SÓ
--   quando a conta pedida (`p_conta`) é do tipo `permuta`. A outra ponta (conta comum) continua sem os sem caixa; VG e CPR não mudam (são
--   caixa). Alcance medido: há UMA conta permuta (a do NJ).
-- ⚠ PATCH DE CORPO GRANDE GUARDADO POR md5 (a função tem 9.472 caracteres): se o corpo não for o medido, NADA muda.
-- Ensaio (28/10): em mar/26 a permuta do NJ passa de −869,29 / não conciliado para 0,00 / conciliado (o mês fecha contra o declarado
-- 0,00), o Total do NJ de mar/26 passa a conciliado; out/26 sem mudança; nenhuma outra linha muda. O saldo declarado 0,00 × o razão
-- acumulado R$ 264.875,89 é dado que o Gabriel confere com o cliente — nada de dado muda aqui.
DO $$
DECLARE
  d text;
  v_anc constant text := 'WHERE l.cancelado = false AND l.sem_movimentacao_caixa = false';
  v_novo constant text := 'WHERE l.cancelado = false AND (l.sem_movimentacao_caixa = false OR EXISTS (SELECT 1 FROM financeiro_contas_bancarias pb WHERE pb.id = p_conta AND lower(btrim(coalesce(pb.tipo_conta, ''''))) = ''permuta''))';
BEGIN
  d := pg_get_functiondef('public.fn_caixa_sistema_pontas'::regproc);
  IF md5(d) <> '46da7b37147e5645c1a3ee52d574c1bb' THEN
    RAISE EXCEPTION 'P145: fn_caixa_sistema_pontas não é a medida (md5 %). Nada foi gravado.', md5(d);
  END IF;
  IF (length(d) - length(replace(d, v_anc, ''))) / length(v_anc) <> 1 THEN
    RAISE EXCEPTION 'P145: a âncora do filtro não casa exatamente 1 vez. Nada foi gravado.';
  END IF;
  EXECUTE replace(d, v_anc, v_novo);
END $$;
