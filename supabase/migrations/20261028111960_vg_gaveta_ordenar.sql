-- P119 (Gabriel 27/10/2026) — a GAVETA da Visao Geral ordena por TODAS as colunas (Comp., Venc., Pgto., Status, Favorecido, Descricao,
-- Conta, Valor), crescente ou decrescente, e a ordem e' feita AQUI, antes da pagina (a gaveta e' paginada, ate' 500 por pagina: ordenar
-- so' a pagina carregada mostraria a ordem errada a partir de 501). Desempate estavel: a data da linha e depois o id do lancamento.
--   · fn_vg_gaveta_ordenada = o corpo de hoje da fn_vg_gaveta + p_ordem ('competencia' | 'vencimento' | 'pagamento' | 'status' |
--     'favorecido' | 'descricao' | 'conta' | 'valor'; NULO = a ordem de hoje: data, maior valor, chave) e p_sentido ('asc' | 'desc').
--     So' a ordem das LINHAS muda: total, contagem, pago/aberto e o resumo por favorecido saem das mesmas CTEs, sem ordem (teste).
--   · Status na ordem do ciclo: vencido, previsto, programado, agendado, realizado, conciliado (o de verdade, com vinculo); vazio no fim.
--     Pgto. so' do realizado (o previsto mostra "—"). Texto em pt-BR (acento no lugar), sem caixa.
--   · fn_vg_gaveta (15 argumentos, a de hoje) vira a chamada da nova com a ordem de hoje: UM corpo so'. (O canal nao deixa DROP; e
--     parametro novo depois de um com DEFAULT tambem precisa de DEFAULT — na mesma funcao, a chamada de 15 ficaria ambigua.)
-- Aplicada por ANCORA sobre o pg_get_functiondef (cada ancora casa UMA vez); corpo de partida conferido pelo md5 (d131f577, o da 111953).
SET LOCAL lock_timeout = '2s';
DO $p$
DECLARE d text; v_old text; v_new text; n int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc
       WHERE oid = 'public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer)'::regprocedure)
     IS DISTINCT FROM 'd131f5779f67c263ce6d21f33a8d2bb0' THEN
    RAISE EXCEPTION 'fn_vg_gaveta: corpo de origem inesperado.';
  END IF;
  d := pg_get_functiondef('public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer)'::regprocedure);

  v_old := 'CREATE OR REPLACE FUNCTION public.fn_vg_gaveta(p_cliente uuid';
  v_new := 'CREATE OR REPLACE FUNCTION public.fn_vg_gaveta_ordenada(p_cliente uuid';
  n := (length(d) - length(replace(d, v_old, ''))) / length(v_old);
  IF n <> 1 THEN RAISE EXCEPTION 'ancora do nome casou % vezes.', n; END IF;
  d := replace(d, v_old, v_new);

  v_old := $a$p_por_pagina integer DEFAULT 500)
 RETURNS jsonb$a$;
  v_new := $a$p_por_pagina integer DEFAULT 500, p_ordem text DEFAULT NULL::text, p_sentido text DEFAULT 'asc'::text)
 RETURNS jsonb$a$;
  n := (length(d) - length(replace(d, v_old, ''))) / length(v_old);
  IF n <> 1 THEN RAISE EXCEPTION 'ancora da assinatura casou % vezes.', n; END IF;
  d := replace(d, v_old, v_new);

  v_old := $a$    RAISE EXCEPTION 'Página inválida (até 500 por página).' USING ERRCODE = '22023';
  END IF;
$a$;
  v_new := $a$    RAISE EXCEPTION 'Página inválida (até 500 por página).' USING ERRCODE = '22023';
  END IF;
  IF (p_ordem IS NOT NULL AND p_ordem NOT IN ('competencia', 'vencimento', 'pagamento', 'status', 'favorecido', 'descricao', 'conta', 'valor'))
     OR p_sentido IS NULL OR p_sentido NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'Ordem inválida.' USING ERRCODE = '22023';
  END IF;
$a$;
  n := (length(d) - length(replace(d, v_old, ''))) / length(v_old);
  IF n <> 1 THEN RAISE EXCEPTION 'ancora da validacao casou % vezes.', n; END IF;
  d := replace(d, v_old, v_new);

  v_old := $a$    SELECT lan.*, row_number() OVER (ORDER BY lan.dt, lan.valor DESC, lan.chave) AS i FROM lan
$a$;
  v_new := $a$    -- P119: a ordem escolhida, ANTES da pagina; uma chave por tipo (data, numero, texto), a das outras nula; desempate: data, id
    SELECT k.*, row_number() OVER (ORDER BY
             CASE WHEN p_sentido = 'asc' THEN k.k_d END ASC NULLS LAST, CASE WHEN p_sentido = 'desc' THEN k.k_d END DESC NULLS LAST,
             CASE WHEN p_sentido = 'asc' THEN k.k_n END ASC NULLS LAST, CASE WHEN p_sentido = 'desc' THEN k.k_n END DESC NULLS LAST,
             CASE WHEN p_sentido = 'asc' THEN k.k_t END ASC NULLS LAST, CASE WHEN p_sentido = 'desc' THEN k.k_t END DESC NULLS LAST,
             CASE WHEN p_ordem IS NULL THEN k.valor END DESC, k.dt, k.lancamento_id, k.chave) AS i
      FROM (SELECT lan.*,
                   CASE WHEN p_ordem IS NULL THEN lan.dt WHEN p_ordem = 'competencia' THEN lan.data_competencia
                        WHEN p_ordem = 'vencimento' THEN lan.data_vencimento
                        WHEN p_ordem = 'pagamento' THEN CASE WHEN lan.eh_real THEN lan.data_pagamento END END AS k_d,
                   CASE WHEN p_ordem = 'valor' THEN lan.valor END AS k_n,
                   CASE WHEN p_ordem = 'status' THEN
                          CASE WHEN lan.vencido THEN '0' WHEN lan.eh_real AND lan.conciliado THEN '5'
                               WHEN lower(lan.status) = 'previsto' THEN '1' WHEN lower(lan.status) = 'programado' THEN '2'
                               WHEN lower(lan.status) = 'agendado' THEN '3' WHEN lower(lan.status) = 'realizado' THEN '4'
                               ELSE '9' || coalesce(lower(lan.status), '') END
                        WHEN p_ordem = 'favorecido' THEN lower(lan.fav_nome) COLLATE "pt-BR-x-icu"
                        WHEN p_ordem = 'descricao' THEN lower(nullif(trim(lan.descricao), '')) COLLATE "pt-BR-x-icu"
                        WHEN p_ordem = 'conta' THEN lower(lan.conta_nome) COLLATE "pt-BR-x-icu" END AS k_t
              FROM lan) k
$a$;
  n := (length(d) - length(replace(d, v_old, ''))) / length(v_old);
  IF n <> 1 THEN RAISE EXCEPTION 'ancora da ordem casou % vezes.', n; END IF;
  d := replace(d, v_old, v_new);
  EXECUTE d;
END $p$;

REVOKE ALL ON FUNCTION public.fn_vg_gaveta_ordenada(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_gaveta_ordenada(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer, text, text) TO authenticated;
COMMENT ON FUNCTION public.fn_vg_gaveta_ordenada(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer, text, text) IS
  'FIN-VISAO-GERAL-01 PR 5 + P103 + P119: a gaveta da Visao Geral (filhos do no ou os lancamentos do subcentro, paginados), com a ordem das linhas escolhida (p_ordem, p_sentido) feita antes da pagina.';

-- a de 15 argumentos: a mesma, na ordem de hoje (um corpo so')
CREATE OR REPLACE FUNCTION public.fn_vg_gaveta(
  p_cliente uuid, p_de date, p_ate date, p_mes text, p_lado text, p_caminho text[] DEFAULT '{}'::text[], p_criterio text DEFAULT 'mes'::text,
  p_contas uuid[] DEFAULT NULL::uuid[], p_fazendas uuid[] DEFAULT NULL::uuid[], p_atividade text DEFAULT NULL::text, p_hoje date DEFAULT CURRENT_DATE,
  p_status text[] DEFAULT NULL::text[], p_incluir_vencidos boolean DEFAULT true, p_pagina integer DEFAULT 1, p_por_pagina integer DEFAULT 500)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.fn_vg_gaveta_ordenada(p_cliente, p_de, p_ate, p_mes, p_lado, p_caminho, p_criterio, p_contas, p_fazendas, p_atividade, p_hoje,
                                      p_status, p_incluir_vencidos, p_pagina, p_por_pagina, NULL, 'asc')
$function$;
