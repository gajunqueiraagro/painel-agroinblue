-- P109 (Gabriel 27/10, achado P120 do Code Notas) — a DEDUCAO da meta vem SO' da fn_meta_linhas (calculada: custo comercial × cabecas,
-- 5030), NUNCA de financeiro_lancamentos_v2 com cenario = 'meta'. Ha' 52 lancamentos META gravados no financeiro (movimentacao_rebanho;
-- serao cancelados depois desta publicacao); a coluna Meta da Visao Geral (fn_vg_meta, pelo "espelho" da fn_meta_linhas) e o DRE Meta
-- (que le^ a v2 por conta propria) liam as DEDUCOES deles.
--   · fn_meta_linhas: o ramo 'espelho' (v2 meta, deducao) SAI — nos dois regimes. A VG e a tela de meta seguem iguais entre si (nenhuma
--     das duas o tem). Corpo de partida: o da 111958 (md5 30ebf133).
--   · fn_dre_pecuaria (3 lugares) e fn_dre_pecuaria_lancamentos (1): no cenario meta, a v2 ja' ficava fora em venda e reposicao (o
--     espelho do rebanho); agora fica fora tambem TODA deducao da v2 meta (qualquer origem). Corpos de partida: dre 8f7f3dae (111957),
--     drill ecc225c0.
-- Aplicada por ANCORA sobre o pg_get_functiondef; cada ancora casa o numero exato de vezes.
SET LOCAL lock_timeout = '2s';
DO $p$
DECLARE d text; v_old text; v_new text; n int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_meta_linhas(uuid, integer, text)'::regprocedure) IS DISTINCT FROM '30ebf133596aec30c210a55db21e969d'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_dre_pecuaria(uuid, text, text, text)'::regprocedure) IS DISTINCT FROM '8f7f3dae7ab03ab5ea679486a6d57ca5'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_dre_pecuaria_lancamentos(uuid, uuid, text, text, text, text, text)'::regprocedure) IS DISTINCT FROM 'ecc225c084d42e652113c2fd22ef44d6' THEN
    RAISE EXCEPTION 'corpo de origem inesperado.';
  END IF;

  -- ── fn_meta_linhas: sem o espelho da v2 ──
  d := pg_get_functiondef('public.fn_meta_linhas(uuid, integer, text)'::regprocedure);
  v_old := $a$
  UNION ALL
  -- o espelho da v2 so' na deducao
  SELECT l.fazenda_id, l.plano_conta_id,
         extract(month FROM CASE WHEN p_regime = 'caixa' THEN coalesce(l.data_vencimento, l.data_competencia) ELSE l.data_competencia END)::int,
         abs(l.valor), 'espelho'::text, 'espelho da v2 (dedução)'::text, l.id
    FROM public.financeiro_lancamentos_v2 l
    JOIN public.financeiro_plano_contas pc ON pc.id = l.plano_conta_id
   WHERE l.cliente_id = p_cliente AND l.cenario = 'meta' AND coalesce(l.cancelado, false) = false
     AND l.origem_lancamento = 'movimentacao_rebanho' AND pc.bloco_dre = 'deducao'
     AND extract(year FROM CASE WHEN p_regime = 'caixa' THEN coalesce(l.data_vencimento, l.data_competencia) ELSE l.data_competencia END) = p_ano;
$a$;
  v_new := $a$;
  -- P109/P120: nenhum ramo le^ financeiro_lancamentos_v2 com cenario 'meta' (a deducao da meta e' a calculada, acima)
$a$;
  n := (length(d) - length(replace(d, v_old, ''))) / length(v_old);
  IF n <> 1 THEN RAISE EXCEPTION 'fn_meta_linhas: a ancora do espelho casou % vezes.', n; END IF;
  EXECUTE replace(d, v_old, v_new);

  -- ── o DRE: no cenario meta, nenhuma deducao da v2 ──
  v_old := $a$not (p_cenario='meta' and l.origem_lancamento='movimentacao_rebanho' and p.bloco_dre in ('venda','reposicao'))$a$;
  v_new := $a$not (p_cenario='meta' and (p.bloco_dre='deducao' or (l.origem_lancamento='movimentacao_rebanho' and p.bloco_dre in ('venda','reposicao'))))$a$;
  d := pg_get_functiondef('public.fn_dre_pecuaria(uuid, text, text, text)'::regprocedure);
  n := (length(d) - length(replace(d, v_old, ''))) / length(v_old);
  IF n <> 3 THEN RAISE EXCEPTION 'fn_dre_pecuaria: a ancora casou % vezes (esperadas 3).', n; END IF;
  EXECUTE replace(d, v_old, v_new);
  d := pg_get_functiondef('public.fn_dre_pecuaria_lancamentos(uuid, uuid, text, text, text, text, text)'::regprocedure);
  n := (length(d) - length(replace(d, v_old, ''))) / length(v_old);
  IF n <> 1 THEN RAISE EXCEPTION 'fn_dre_pecuaria_lancamentos: a ancora casou % vezes (esperada 1).', n; END IF;
  EXECUTE replace(d, v_old, v_new);
END $p$;

COMMENT ON FUNCTION public.fn_meta_linhas(uuid, integer, text) IS
  'P109 FIN-META-01: a meta por (fazenda, plano_conta_id, mes) e origem, no regime pedido — o dono unico da meta (digitada, projetos no caixa, calculada do rebanho, adiantamento de boitel e parcelas de financiamento/consorcio no caixa). Nunca le^ financeiro_lancamentos_v2 com cenario meta.';
