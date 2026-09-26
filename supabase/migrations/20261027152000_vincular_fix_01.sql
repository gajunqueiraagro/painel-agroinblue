-- VINCULAR-FIX-01 — correcoes do vincular (VINCULAR-LANC-OC-01) relatadas pelo Gabriel em 25/09/2026
--
-- ⚠ PATCH GUARDADO POR md5 (metodo aprovado em 24/09/2026, DRE-DESTAQUE-LAVOURA-01): os dois corpos tem
--   25.314 e 9.356 caracteres. Para cada funcao: (1) aborta se o md5 do prosrc de origem nao for o
--   esperado; (2) exige que CADA ancora case exatamente 1x; (3) aplica sobre `pg_get_functiondef` (o
--   cabecalho, SECURITY, search_path e a ACL ficam como estao) e confere o md5 do resultado.
--   Reexecutar FALHA na guarda de origem.
--   ⚠ REGISTRADA como `20260925223916` pelo apply_migration (timestamp do dia), nao com o do nome.
--
-- 1. HASH (D3 do Gabriel: o vinculo PRESERVA o hash original).
--    ⚠ A FASE 1a ERROU NA PRATICA: `compute_financeiro_lancamento_v2_hash` nao usa a competencia, mas o
--      gatilho `trg_financeiro_lancamento_v2_hash` e' `BEFORE UPDATE OF ... data_competencia ...` e
--      RECALCULA o hash com a formula de hoje. Medido em 25/09/2026: 63.758 importados guardam hash de
--      formula antiga (HASH-IMPORT-DEFASADO-01 no CLAUDE.md) — o Iagro 2a8562dd tinha `cc9c2320`, que
--      e' exatamente a formula de 6 campos anterior a 10/04/2026. Mover a competencia trocava a
--      identidade e a guarda abortava.
--    Conserto: depois do UPDATE, um segundo UPDATE SO' de `hash_importacao` regrava o original. A coluna
--    nao esta' na lista de nenhum dos dois gatilhos de hash (`..._hash` e `..._unique_hash`), entao
--    nenhum dispara. Nada desligado. A guarda continua.
--
-- 2. CANDIDATA: `qtd` (cabecas) no envelope, para a linha "data · tipo · fazenda · N cab · contraparte".
--
-- 3. COMPROMISSO A COMPROMISSO + DIRECAO. Entram tambem os compromissos do MESMO subcentro do
--    lancamento, qualquer que seja o componente (Graxaria c80ebe9e: 5.056 a receber gravado como
--    `adiantamento_devolvido` no plano "Abates de Femeas" — o mapa so' dava `principal` a esse
--    subcentro, e o compromisso de valor exato nem chegava a ser avaliado). E a DIRECAO do plano do
--    compromisso tem de ser a do lancamento: entrada so' com plano de entrada, saida so' com saida.
--    Medido: todo compromisso vivo tem plano, e a direcao do plano concorda com o mapa em todos.
--    Na lista, o valor exato vem primeiro; `valor_exato` da OC passa a contar so' o compromisso exato
--    que NAO esta' liquidado, e `todos_liquidados` diz quando a OC inteira esta' bloqueada.
--    "Estorno Recebido" NAO entra no mapa (decisao: o par de estorno fica fora da OC).
--
-- 4. BOITEL: a janela da venda em boitel vai de `zoo_operacao_boitel.data_envio` ate' `data_abate`
--    (+ a janela de 60 dias). ⚠ MEDIDO: `data_envio` esta' VAZIO nas 15 linhas de boitel (8 projetado, 7
--    realizado) — sem envio, a OC cai na regra de antes, e hoje o criterio nao muda nenhuma candidata.
--    Pista da descricao no ranking, depois do valor exato: "boitel" numa OC de boitel, e o numero de
--    cabecas da OC escrito na descricao ("Abate 048 vacas" casa 48).
--
-- PROVAS EM ROLLBACK (25/09/2026, contra as funcoes novas; nada gravado):
--  * HASH: 2a8562dd com o hash antigo `cc9c2320` x OC f93f1a2b (criar compromisso de frete): o vinculo GRAVA,
--    competencia 2024-08-02 -> 2024-08-04, e a linha segue `cc9c2320`. Controle: UPDATE cru da competencia na
--    mesma linha da' `e6b24dbc` — o par exato do erro relatado.
--  * COMPROMISSO A COMPROMISSO: a721d5ca de volta no plano "Abates de Femeas" e na Faz. 3 Muchachas ->
--    c80ebe9e em 1o, `valor_exato` true, `todos_liquidados` false, lista 73a183eb (adiantamento_devolvido 5.056,
--    preencher, exato) e 0119442b (principal, recusar); simulacao com p_compromisso_id = 73a183eb: ok.
--  * DIRECAO: 6b349b87 (plano de SAIDA) posto no subcentro "Abates de Femeas": fora da lista da candidata, e
--    forcado no vincular -> "Direcao do compromisso (2-Saídas) nao confere com a do lancamento (1-Entradas)".
--  * BOITEL: 37a2f86a (15/05/2025). Sem envio: so' os 4 abates. Com envio 01/05 e abate 30/06/2025 na linha
--    realizada de b58bf556: ela entra em 1o, ref 2025-05-01, distancia 0, pista 1. Com envio 20/05 (depois do
--    lancamento): fora.
--  * CANDIDATAS do Iagro 2a8562dd: f93f1a2b, 2024-08-04, Faz Baia Grande, qtd 48, BMG Foods, pista 1 (o "048"
--    da descricao), `todos_liquidados` true (o taxas_impostos 541,84 ja' esta' liquidado).

-- ─── funcoes novas (pequenas, puras) ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._oc_vinculo_direcao_compromisso(p_plano_conta_id uuid, p_subcentro text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- A direcao de um compromisso: a do PLANO dele; sem plano, a do mapa pelo subcentro.
  SELECT coalesce((SELECT pc.tipo_operacao FROM public.financeiro_plano_contas pc WHERE pc.id = p_plano_conta_id),
                  (SELECT m.tipo_operacao FROM public._oc_vinculo_mapa() m WHERE m.subcentro = p_subcentro));
$function$;

CREATE OR REPLACE FUNCTION public._oc_vinculo_dist_janela(p_data date, p_ini date, p_fim date)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- Distancia de uma data a uma janela [ini, fim]: 0 dentro, dias depois do fim, NULL antes do inicio
  -- (antes do envio o lancamento nao e' do boitel). `least` ignora NULL.
  SELECT CASE WHEN p_data IS NULL OR p_ini IS NULL THEN NULL
              WHEN p_data < p_ini THEN NULL
              WHEN p_data <= coalesce(p_fim, p_ini) THEN 0
              ELSE p_data - coalesce(p_fim, p_ini) END;
$function$;

CREATE OR REPLACE FUNCTION public._oc_vinculo_pista(p_descricao text, p_eh_boitel boolean, p_qtd numeric)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- Pista da descricao: +1 "boitel" numa OC de boitel; +1 o numero de cabecas da OC escrito nela.
  SELECT (coalesce(p_eh_boitel, false) AND coalesce(p_descricao, '') ~* 'boitel')::int
       + (p_qtd IS NOT NULL AND EXISTS (SELECT 1 FROM regexp_matches(coalesce(p_descricao, ''), '(\d{1,6})', 'g') m
                                         WHERE m[1]::numeric = p_qtd))::int;
$function$;

REVOKE ALL ON FUNCTION public._oc_vinculo_direcao_compromisso(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._oc_vinculo_dist_janela(date, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._oc_vinculo_pista(text, boolean, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._oc_vinculo_direcao_compromisso(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._oc_vinculo_dist_janela(date, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._oc_vinculo_pista(text, boolean, numeric) TO authenticated, service_role;

-- ─── o patch ─────────────────────────────────────────────────────────────────────────────────────
DO $patch$
DECLARE
  v_oid oid; v_src text; v_def text; v_novo text;
  v_ancoras text[]; v_trocas text[];
  i int; v_n int;
BEGIN
  -- ═══ oc_vincular_lancamento ═══
  SELECT p.oid, p.prosrc INTO v_oid, v_src FROM pg_proc p WHERE p.proname = 'oc_vincular_lancamento';
  IF md5(v_src) <> '72be497d998f1f5232d10cc383464e04' THEN
    RAISE EXCEPTION 'oc_vincular_lancamento: md5 de origem % nao e o esperado', md5(v_src); END IF;
  v_ancoras := ARRAY[
$a1$    IF v_comp.natureza <> v_natureza OR NOT (v_comp.componente = ANY (v_regra.componentes)) THEN
      RAISE EXCEPTION 'Compromisso %/% nao cabe no subcentro "%"', v_comp.natureza, v_comp.componente, v_l.subcentro USING ERRCODE = 'P0001'; END IF;$a1$,
$a2$         AND c.componente = ANY (v_regra.componentes) AND c.status <> 'cancelado';$a2$,
$a3$  SELECT * INTO v_l_depois FROM public.financeiro_lancamentos_v2 WHERE id = v_l.id;$a3$
  ];
  v_trocas := ARRAY[
$t1$    -- VINCULAR-FIX-01: cabe o compromisso do item do mapa OU o do MESMO subcentro do lancamento, e a
    -- direcao do plano do compromisso tem de ser a do lancamento. A natureza passa a ser a do compromisso.
    IF NOT ((v_comp.natureza = v_natureza AND v_comp.componente = ANY (v_regra.componentes))
            OR v_comp.subcentro IS NOT DISTINCT FROM v_l.subcentro) THEN
      RAISE EXCEPTION 'Compromisso %/% nao cabe no subcentro "%"', v_comp.natureza, v_comp.componente, v_l.subcentro USING ERRCODE = 'P0001'; END IF;
    IF coalesce(public._oc_vinculo_direcao_compromisso(v_comp.plano_conta_id, v_comp.subcentro), v_regra.tipo_operacao)
       IS DISTINCT FROM v_l.tipo_operacao THEN
      RAISE EXCEPTION 'Direcao do compromisso (%) nao confere com a do lancamento (%)',
        public._oc_vinculo_direcao_compromisso(v_comp.plano_conta_id, v_comp.subcentro), v_l.tipo_operacao USING ERRCODE = 'P0001'; END IF;
    v_natureza := v_comp.natureza;$t1$,
$t2$         AND c.componente = ANY (v_regra.componentes) AND c.status <> 'cancelado'
          OR (c.operacao_id = p_operacao_id AND c.status <> 'cancelado'
              AND c.subcentro IS NOT DISTINCT FROM v_l.subcentro
              AND coalesce(public._oc_vinculo_direcao_compromisso(c.plano_conta_id, c.subcentro), v_regra.tipo_operacao)
                  IS NOT DISTINCT FROM v_l.tipo_operacao);$t2$,
$t3$  -- VINCULAR-FIX-01 (D3): `data_competencia` esta' na lista UPDATE OF de `trg_financeiro_lancamento_v2_hash`,
  -- e o gatilho RECALCULA o hash com a formula de hoje — num importado de formula antiga
  -- (HASH-IMPORT-DEFASADO-01) isso trocaria a identidade. Regrava o original com um UPDATE SO' de
  -- `hash_importacao`, coluna fora das listas dos dois gatilhos de hash. A guarda abaixo fica.
  UPDATE public.financeiro_lancamentos_v2 SET hash_importacao = v_l.hash_importacao
   WHERE id = v_l.id AND hash_importacao IS DISTINCT FROM v_l.hash_importacao;
  SELECT * INTO v_l_depois FROM public.financeiro_lancamentos_v2 WHERE id = v_l.id;$t3$
  ];
  v_def := pg_get_functiondef(v_oid);
  v_novo := v_src;
  FOR i IN 1 .. array_length(v_ancoras, 1) LOOP
    v_n := (length(v_src) - length(replace(v_src, v_ancoras[i], ''))) / length(v_ancoras[i]);
    IF v_n <> 1 THEN RAISE EXCEPTION 'oc_vincular_lancamento: ancora % casa % vezes', i, v_n; END IF;
    v_novo := replace(v_novo, v_ancoras[i], v_trocas[i]);
    v_def := replace(v_def, v_ancoras[i], v_trocas[i]);
  END LOOP;
  EXECUTE v_def;
  SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = v_oid;
  IF v_src IS DISTINCT FROM v_novo OR md5(v_src) <> '47eced2633752ba95684191b9153b08c' THEN
    RAISE EXCEPTION 'oc_vincular_lancamento: md5 de destino % nao e o esperado', md5(v_src); END IF;

  -- ═══ oc_candidatas_vinculo ═══
  SELECT p.oid, p.prosrc INTO v_oid, v_src FROM pg_proc p WHERE p.proname = 'oc_candidatas_vinculo';
  IF md5(v_src) <> 'c6885a6656efe6ff48b3a4bc6809f946' THEN
    RAISE EXCEPTION 'oc_candidatas_vinculo: md5 de origem % nao e o esperado', md5(v_src); END IF;
  v_ancoras := ARRAY[
$c1$    SELECT o.*, coalesce(o.data_abate, o.data_embarque, o.data_operacao) AS d_ref,
           least(abs(coalesce(o.data_abate, o.data_embarque, o.data_operacao) - v_l.data_competencia),
                 abs(coalesce(o.data_abate, o.data_embarque, o.data_operacao) - coalesce(v_l.data_pagamento, v_l.data_competencia))) AS dist,
           (o.fazenda_id IS NOT DISTINCT FROM v_l.fazenda_id) AS mesma_faz
      FROM public.zoo_operacoes_comerciais o$c1$,
$c2$       AND c.natureza = v_regra.natureza AND c.componente = ANY (v_regra.componentes)
     GROUP BY c.id$c2$,
$c3$             'status', c.status, 'lote_id', c.lote_id, 'parcelas', coalesce(p.parcelas, '[]'::jsonb),$c3$,
$c4$             ORDER BY (c.componente = v_alvo) DESC, abs(v_l.valor - c.valor_total)) AS lista,$c4$,
$c5$           coalesce(bool_or(round(c.valor_total, 2) = round(v_l.valor, 2)), false) AS valor_exato$c5$,
$c6$           'valor_acordado', f.valor_acordado,$c6$,
$c7$         ORDER BY coalesce(cp.valor_exato, false) DESC, f.mesma_faz DESC,$c7$
  ];
  v_trocas := ARRAY[
$d1$    -- VINCULAR-FIX-01: venda em BOITEL mede a janela pelas datas do boitel — de `data_envio` ate'
    -- `data_abate` (a janela de dias vale depois do abate; antes do envio, fora). Sem envio, a regra de antes.
    SELECT o.*, coalesce(bt.data_envio, o.data_abate, o.data_embarque, o.data_operacao) AS d_ref,
           CASE WHEN bt.data_envio IS NOT NULL THEN
             least(public._oc_vinculo_dist_janela(v_l.data_competencia, bt.data_envio, bt.data_abate),
                   public._oc_vinculo_dist_janela(coalesce(v_l.data_pagamento, v_l.data_competencia), bt.data_envio, bt.data_abate))
           ELSE
           least(abs(coalesce(o.data_abate, o.data_embarque, o.data_operacao) - v_l.data_competencia),
                 abs(coalesce(o.data_abate, o.data_embarque, o.data_operacao) - coalesce(v_l.data_pagamento, v_l.data_competencia)))
           END AS dist,
           (o.fazenda_id IS NOT DISTINCT FROM v_l.fazenda_id) AS mesma_faz,
           (bt.operacao_id IS NOT NULL) AS eh_boitel,
           coalesce(o.qtd_negociada, (SELECT sum(lo.qtd_negociada) FROM public.zoo_operacao_lotes lo WHERE lo.operacao_id = o.id)) AS qtd_cab
      FROM public.zoo_operacoes_comerciais o
      LEFT JOIN LATERAL (
        SELECT b.operacao_id, b.data_envio, b.data_abate FROM public.zoo_operacao_boitel b
         WHERE b.operacao_id = o.id ORDER BY (b.cenario::text = 'realizado') DESC LIMIT 1
      ) bt ON true$d1$,
$d2$       -- VINCULAR-FIX-01: tambem o compromisso do MESMO subcentro do lancamento (qualquer componente), e
       -- so' na direcao do lancamento (a do plano do compromisso).
       AND ((c.natureza = v_regra.natureza AND c.componente = ANY (v_regra.componentes))
            OR c.subcentro IS NOT DISTINCT FROM v_l.subcentro)
       AND coalesce(public._oc_vinculo_direcao_compromisso(c.plano_conta_id, c.subcentro), v_regra.tipo_operacao)
           IS NOT DISTINCT FROM v_l.tipo_operacao
     GROUP BY c.id$d2$,
$d3$             'status', c.status, 'lote_id', c.lote_id, 'parcelas', coalesce(p.parcelas, '[]'::jsonb),
             'mesmo_subcentro', c.subcentro IS NOT DISTINCT FROM v_l.subcentro,$d3$,
$d4$             ORDER BY (round(c.valor_total, 2) = round(v_l.valor, 2)) DESC, (c.componente = v_alvo) DESC,
                      abs(v_l.valor - c.valor_total)) AS lista,$d4$,
$d5$           -- VINCULAR-FIX-01: o valor exato que conta e' o de compromisso NAO liquidado; OC bloqueada so'
           -- quando TODOS os compromissos que cabem estao liquidados.
           coalesce(bool_or(round(c.valor_total, 2) = round(v_l.valor, 2)
                            AND NOT (coalesce(p.n_parcelas, 0) <= 1 AND p.liquidado)), false) AS valor_exato,
           coalesce(bool_and(coalesce(p.n_parcelas, 0) <= 1 AND p.liquidado), false) AS todos_liquidados$d5$,
$d6$           'valor_acordado', f.valor_acordado,
           'qtd', f.qtd_cab, 'eh_boitel', f.eh_boitel,
           'todos_liquidados', coalesce(cp.todos_liquidados, false),
           'pista_descricao', public._oc_vinculo_pista(v_l.descricao, f.eh_boitel, f.qtd_cab),$d6$,
$d7$         ORDER BY coalesce(cp.valor_exato, false) DESC,
                  public._oc_vinculo_pista(v_l.descricao, f.eh_boitel, f.qtd_cab) DESC, f.mesma_faz DESC,$d7$
  ];
  v_def := pg_get_functiondef(v_oid);
  v_novo := v_src;
  FOR i IN 1 .. array_length(v_ancoras, 1) LOOP
    v_n := (length(v_src) - length(replace(v_src, v_ancoras[i], ''))) / length(v_ancoras[i]);
    IF v_n <> 1 THEN RAISE EXCEPTION 'oc_candidatas_vinculo: ancora % casa % vezes', i, v_n; END IF;
    v_novo := replace(v_novo, v_ancoras[i], v_trocas[i]);
    v_def := replace(v_def, v_ancoras[i], v_trocas[i]);
  END LOOP;
  EXECUTE v_def;
  SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = v_oid;
  IF v_src IS DISTINCT FROM v_novo OR md5(v_src) <> '63b698eeed7551e2b29cde559459dea4' THEN
    RAISE EXCEPTION 'oc_candidatas_vinculo: md5 de destino % nao e o esperado', md5(v_src); END IF;
END $patch$;
