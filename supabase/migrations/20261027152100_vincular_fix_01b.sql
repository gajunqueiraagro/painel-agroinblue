-- VINCULAR-FIX-01b — ajuste do Gabriel (26/09/2026) sobre a 20261027152000, antes do commit
--
-- ⚠ REGRA PERMANENTE (Gabriel, 26/09/2026): na pecuaria, lancamentos com MESMO NOME, MESMO VALOR e MESMO DIA
--   sao NORMAIS — cada GTA, cada guia de Fundersul, cada viagem de frete e' um lancamento. Nunca duplicata,
--   nunca suspeita. Consequencia no vincular: uma OC pode ter N compromissos do mesmo componente (tres
--   Fundersul, Iagro, Funrural), e "o componente ja' esta' pago" NAO bloqueia nada.
--
-- 1. REGRA DO VINCULAR POR CANDIDATA (o "todos_liquidados" deixa de bloquear):
--    a) compromisso LIVRE com valor exato -> usa esse (a tela o manda em `p_compromisso_id`, como ja' fazia);
--    b) compromisso livre sem valor exato -> `escolher_compromisso` + `pode_criar_novo` (antes, com dois ou
--       mais livres do item a resposta nao oferecia criar, e `p_criar_novo` era IGNORADO nesse ramo);
--    c) nenhum compromisso livre do componente -> CRIA um novo, e a resposta leva o aviso
--       `componente_ja_liquidado` com os compromissos pagos ("ja existe ... de R$ X liquidado nesta OC; este
--       e outro pagamento"). O operador le no resumo da simulacao e confirma no Vincular;
--    d) vermelho SO' por direcao incompativel ou OC cancelada/rascunho — as duas ja' ficam fora da lista
--       de candidatas (a direcao, desde a 20261027152000; cancelada/rascunho, desde o VINCULAR-LANC-OC-01).
--    "Livre" = `_oc_vinculo_compromisso_liquidado` falso, o MESMO predicado de "liquidado" que
--    `oc_candidatas_vinculo` usa na coluna `acao_prevista = 'recusar'` (parcela unica com titulo realizado,
--    conciliado ou com liquidacao viva). Compromisso de varias parcelas nunca e' "liquidado" aqui: e'
--    `escolher_parcela`, como antes.
--
-- 2. JANELA DO BOITEL COM FALLBACK: inicio = coalesce(data_envio, data da OC); fim = coalesce(data_abate,
--    inicio + 150 dias) + a janela de 60 dias. ⚠ `data_envio` esta' vazio nos 15 registros de
--    `zoo_operacao_boitel` (pendencia BOITEL-DATA-ENVIO-01 no CLAUDE.md), entao hoje o inicio e' sempre a data
--    da OC.
--
-- ⚠ PATCH GUARDADO POR md5 sobre os corpos da 20261027152000 (origem 47eced26 / 63b698ee). Reexecutar FALHA
--   na guarda de origem.
--   ⚠ REGISTRADA como `20260926082709` pelo apply_migration (timestamp do dia), nao com o do nome.
--
-- PROVAS EM ROLLBACK (26/09/2026, contra as funcoes novas; nada gravado):
--  * (c) Iagro 2a8562dd x f93f1a2b, so' com o componente: ok, compromisso `criado`, aviso `componente_ja_liquidado`
--    com o Fundersul 541,84 (f8cd2eb1).
--  * TRES IGUAIS: tres copias do Iagro (mesmo nome, valor e dia) na mesma OC, com um compromisso livre de 277,68
--    posto antes: L1 preenche o livre; L2 cria (aviso 541,84 + 277,68); L3 cria (aviso 541,84 + 277,68 + 277,68).
--    Tres partes vivas, quatro compromissos de `taxas_impostos`, nenhum recusado.
--  * BOITEL: frete 37a2f86a movido para 20/08/2026 -> b58bf556 e 7f7de76f com distancia 0 (99 dias da data da OC,
--    fora pela regra velha), 581d075c fora; 10/10/2026 -> 581d075c (0; sem abate, +150) e as outras a 45-46 dias
--    do abate; 01/05/2026 -> nenhum boitel.

-- ─── o predicado de "liquidado" (espelho da coluna `acao_prevista = 'recusar'` das candidatas) ───────
CREATE OR REPLACE FUNCTION public._oc_vinculo_compromisso_liquidado(p_compromisso_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH pp AS (
    SELECT pp.id
      FROM public.zoo_operacao_programacoes pr
      JOIN public.zoo_operacao_parcelas_programacao pp ON pp.programacao_id = pr.id AND pp.status <> 'cancelada'
     WHERE pr.compromisso_id = p_compromisso_id AND pr.status = 'ativa'
  )
  SELECT (SELECT count(*) FROM pp) <= 1
     AND EXISTS (
       SELECT 1 FROM pp
         JOIN public.zoo_operacao_partes pa ON pa.programacao_parcela_id = pp.id AND pa.cancelada = false
         JOIN public.financeiro_lancamentos_v2 f ON f.id = pa.financeiro_lancamento_id
        WHERE f.cancelado IS NOT TRUE
          AND (f.status_transacao IN ('realizado', 'conciliado') OR f.conciliado_em IS NOT NULL
               OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens cbi WHERE cbi.lancamento_id = f.id AND cbi.desfeito_em IS NULL)
               OR EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes lq WHERE lq.financeiro_lancamento_id = f.id AND lq.estornado IS NOT TRUE)));
$function$;
REVOKE ALL ON FUNCTION public._oc_vinculo_compromisso_liquidado(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._oc_vinculo_compromisso_liquidado(uuid) TO authenticated, service_role;

DO $patch$
DECLARE
  v_oid oid; v_src text; v_def text; v_novo text;
  v_ancoras text[]; v_trocas text[];
  i int; v_n int;
BEGIN
  -- ═══ oc_vincular_lancamento ═══
  SELECT p.oid, p.prosrc INTO v_oid, v_src FROM pg_proc p WHERE p.proname = 'oc_vincular_lancamento';
  IF md5(v_src) <> '47eced2633752ba95684191b9153b08c' THEN
    RAISE EXCEPTION 'oc_vincular_lancamento: md5 de origem % nao e o esperado', md5(v_src); END IF;
  v_ancoras := ARRAY[
$a1$    SELECT count(*) INTO v_n FROM public.zoo_operacao_compromissos c
     WHERE c.operacao_id = p_operacao_id AND c.natureza = v_natureza AND c.componente = v_componente AND c.status <> 'cancelado';$a1$,
$a2$    IF v_n > 1 THEN
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'descricao', c.descricao, 'valor_total', c.valor_total,$a2$,
$a3$        FROM public.zoo_operacao_compromissos c
       WHERE c.operacao_id = p_operacao_id AND c.natureza = v_natureza AND c.componente = v_componente AND c.status <> 'cancelado';
      RETURN jsonb_build_object('ok', false, 'acao', 'recusado', 'motivo', 'escolher_compromisso',
        'compromissos', v_lista, 'operacao_versao', v_op.versao);$a3$,
$a4$       WHERE c.operacao_id = p_operacao_id AND c.natureza = v_natureza AND c.componente = v_componente AND c.status <> 'cancelado'
       FOR UPDATE;$a4$,
$a5$       WHERE c.operacao_id = p_operacao_id AND c.natureza = v_natureza
         AND c.componente = ANY$a5$,
$a6$                  IS NOT DISTINCT FROM v_l.tipo_operacao);$a6$,
$a7$  IF v_natureza = 'principal' THEN
    SELECT b.base INTO v_base$a7$
  ];
  v_trocas := ARRAY[
$t1$    -- VINCULAR-FIX-01b: conta so' os compromissos LIVRES do item. Pago nao bloqueia: na pecuaria o mesmo
    -- componente se repete (tres guias de Fundersul sao tres compromissos), e o proximo pagamento cria outro.
    SELECT count(*) INTO v_n FROM public.zoo_operacao_compromissos c
     WHERE c.operacao_id = p_operacao_id AND c.natureza = v_natureza AND c.componente = v_componente AND c.status <> 'cancelado'
       AND NOT public._oc_vinculo_compromisso_liquidado(c.id);$t1$,
$t2$    IF p_criar_novo IS TRUE THEN
      NULL;  -- VINCULAR-FIX-01b: criar novo e' escolha explicita do operador, mesmo com compromisso livre do item
    ELSIF v_n > 1 THEN
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'descricao', c.descricao, 'valor_total', c.valor_total,$t2$,
$t3$        FROM public.zoo_operacao_compromissos c
       WHERE c.operacao_id = p_operacao_id AND c.natureza = v_natureza AND c.componente = v_componente AND c.status <> 'cancelado'
         AND NOT public._oc_vinculo_compromisso_liquidado(c.id);
      RETURN jsonb_build_object('ok', false, 'acao', 'recusado', 'motivo', 'escolher_compromisso',
        'pode_criar_novo', true, 'compromissos', v_lista, 'operacao_versao', v_op.versao);$t3$,
$t4$       WHERE c.operacao_id = p_operacao_id AND c.natureza = v_natureza AND c.componente = v_componente AND c.status <> 'cancelado'
         AND NOT public._oc_vinculo_compromisso_liquidado(c.id)
       FOR UPDATE;$t4$,
$t5$       WHERE NOT public._oc_vinculo_compromisso_liquidado(c.id) AND (c.operacao_id = p_operacao_id AND c.natureza = v_natureza
         AND c.componente = ANY$t5$,
$t6$                  IS NOT DISTINCT FROM v_l.tipo_operacao));$t6$,
$t7$  -- VINCULAR-FIX-01b (c): compromisso CRIADO agora ao lado de outro do mesmo componente ja' pago — nao e'
  -- repeticao, e' outro pagamento (regra da pecuaria). O aviso so' diz, para o operador confirmar.
  IF v_comp_antes IS NULL THEN
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'valor_total', c.valor_total, 'descricao', c.descricao) ORDER BY c.created_at)
      INTO v_lista
      FROM public.zoo_operacao_compromissos c
     WHERE c.operacao_id = p_operacao_id AND c.natureza = v_natureza AND c.componente = v_componente
       AND c.status <> 'cancelado' AND c.id <> v_comp.id AND public._oc_vinculo_compromisso_liquidado(c.id);
    IF v_lista IS NOT NULL THEN
      v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('codigo', 'componente_ja_liquidado',
        'componente', v_componente, 'compromissos', v_lista));
    END IF;
  END IF;
  IF v_natureza = 'principal' THEN
    SELECT b.base INTO v_base$t7$
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
  IF v_src IS DISTINCT FROM v_novo OR md5(v_src) <> '9e06563f1ae4486ad60c49c61d38078a' THEN
    RAISE EXCEPTION 'oc_vincular_lancamento: md5 de destino % nao e o esperado (igual ao patch: %)', md5(v_src), v_src IS NOT DISTINCT FROM v_novo; END IF;

  -- ═══ oc_candidatas_vinculo ═══
  SELECT p.oid, p.prosrc INTO v_oid, v_src FROM pg_proc p WHERE p.proname = 'oc_candidatas_vinculo';
  IF md5(v_src) <> '63b698eeed7551e2b29cde559459dea4' THEN
    RAISE EXCEPTION 'oc_candidatas_vinculo: md5 de origem % nao e o esperado', md5(v_src); END IF;
  v_ancoras := ARRAY[
$c1$    -- `data_abate` (a janela de dias vale depois do abate; antes do envio, fora). Sem envio, a regra de antes.
    SELECT o.*, coalesce(bt.data_envio, o.data_abate, o.data_embarque, o.data_operacao) AS d_ref,
           CASE WHEN bt.data_envio IS NOT NULL THEN
             least(public._oc_vinculo_dist_janela(v_l.data_competencia, bt.data_envio, bt.data_abate),
                   public._oc_vinculo_dist_janela(coalesce(v_l.data_pagamento, v_l.data_competencia), bt.data_envio, bt.data_abate))$c1$
  ];
  v_trocas := ARRAY[
$d1$    -- `data_abate` (a janela de dias vale depois do abate; antes do envio, fora). VINCULAR-FIX-01b: sem envio
    -- (vazio nos 15 registros — BOITEL-DATA-ENVIO-01), o inicio e' a data da OC; sem abate, inicio + 150 dias.
    SELECT o.*, CASE WHEN bt.operacao_id IS NOT NULL THEN coalesce(bt.data_envio, o.data_operacao)
                     ELSE coalesce(o.data_abate, o.data_embarque, o.data_operacao) END AS d_ref,
           CASE WHEN bt.operacao_id IS NOT NULL THEN
             least(public._oc_vinculo_dist_janela(v_l.data_competencia, coalesce(bt.data_envio, o.data_operacao),
                     coalesce(bt.data_abate, coalesce(bt.data_envio, o.data_operacao) + 150)),
                   public._oc_vinculo_dist_janela(coalesce(v_l.data_pagamento, v_l.data_competencia), coalesce(bt.data_envio, o.data_operacao),
                     coalesce(bt.data_abate, coalesce(bt.data_envio, o.data_operacao) + 150)))$d1$
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
  IF v_src IS DISTINCT FROM v_novo OR md5(v_src) <> '70231c3021c1fb252836148a96673339' THEN
    RAISE EXCEPTION 'oc_candidatas_vinculo: md5 de destino % nao e o esperado (igual ao patch: %)', md5(v_src), v_src IS NOT DISTINCT FROM v_novo; END IF;
END $patch$;
