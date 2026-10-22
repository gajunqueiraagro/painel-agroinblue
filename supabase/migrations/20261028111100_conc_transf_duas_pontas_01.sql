-- CONC-TRANSF-DUAS-PONTAS-01 (Gabriel 22/10/2026, URGENTE) — transferencia entre contas tem DUAS pontas: a de origem concilia com a
-- SAIDA no extrato da conta de origem, a de destino com a ENTRADA no extrato da conta de destino. A guarda de "ja' conciliado" olhava
-- "qualquer item ativo do lancamento" e recusava a segunda ponta (caso real: 77d37bbf, Pix 29/06 R$ 50.000 no BB x transferencia
-- Bradesco -> BB ja' ligada no Bradesco). Agora, para transferencia, guarda, saldo livre e status de conciliado sao POR CONTA; para
-- todo o resto, nada muda (as funcoes de apoio devolvem o mesmo que a regra antiga).
-- Modos: 1:1 (`fn_vincular_extrato_lancamento`, sem precisar do `p_dupla_ponta`), grupo, Casar com o banco (1:N e N:1), bloco,
-- "Ligar os exatos do mes" (sugestao automatica em lote), o conciliar do mes, os candidatos da Estacao e a Conferencia
-- (`fn_extratos_espelhados`: status do lado do sistema por conta + `pontas` com a frase pronta). O desfazer ja' era por extrato
-- (`fn_desfazer_vinculo_extrato`) e por bloco (que so' volta o status de quem ficou sem vinculo): desfazer uma ponta nao mexe na outra.
-- O sinal certo de cada ponta ja' era exigido (credito no destino, debito na origem); o N:1 passa a exigir tambem.

-- ── apoio: a regra por conta ──────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._fn_conc_eh_transf(p_lanc uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 l
                  WHERE l.id = p_lanc AND l.tipo_operacao LIKE '3-%'
                    AND l.conta_bancaria_id IS NOT NULL AND l.conta_destino_id IS NOT NULL
                    AND l.conta_bancaria_id <> l.conta_destino_id)
$$;

-- o vinculo (lancamento, extrato_a) conta contra o extrato_b? Fora de transferencia, sempre; na transferencia, so' na mesma conta.
CREATE OR REPLACE FUNCTION public._fn_conc_mesma_ponta(p_lanc uuid, p_ext_a uuid, p_ext_b uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT NOT public._fn_conc_eh_transf(p_lanc)
      OR (SELECT a.conta_bancaria_id FROM extrato_bancario_v2 a WHERE a.id = p_ext_a)
         IS NOT DISTINCT FROM (SELECT b.conta_bancaria_id FROM extrato_bancario_v2 b WHERE b.id = p_ext_b)
$$;

CREATE OR REPLACE FUNCTION public._fn_conc_ligado_na_conta(p_lanc uuid, p_conta uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c JOIN extrato_bancario_v2 x ON x.id = c.extrato_id
                  WHERE c.lancamento_id = p_lanc AND c.desfeito_em IS NULL
                    AND (x.conta_bancaria_id = p_conta OR NOT public._fn_conc_eh_transf(p_lanc)))
$$;

CREATE OR REPLACE FUNCTION public._fn_conc_aplicado_na_conta(p_lanc uuid, p_conta uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(sum(c.valor_aplicado), 0) FROM conciliacao_bancaria_itens c JOIN extrato_bancario_v2 x ON x.id = c.extrato_id
   WHERE c.lancamento_id = p_lanc AND c.desfeito_em IS NULL
     AND (x.conta_bancaria_id = p_conta OR NOT public._fn_conc_eh_transf(p_lanc))
$$;

-- as duas pontas de uma transferencia, com a frase pronta ("conciliado no Bradesco · falta o BB"); fora de transferencia, NULL
CREATE OR REPLACE FUNCTION public._fn_conc_transf_pontas(p_lanc uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN NOT public._fn_conc_eh_transf(p_lanc) THEN NULL ELSE (
    SELECT jsonb_build_object('origem', o, 'destino', d,
      'frase', CASE WHEN o AND d THEN 'conciliado nas duas pontas'
                    WHEN o THEN format('conciliado no %s · falta o %s', public._fn_conc_conta_txt(l.conta_bancaria_id), public._fn_conc_conta_txt(l.conta_destino_id))
                    WHEN d THEN format('conciliado no %s · falta o %s', public._fn_conc_conta_txt(l.conta_destino_id), public._fn_conc_conta_txt(l.conta_bancaria_id))
                    ELSE format('falta conciliar no %s e no %s', public._fn_conc_conta_txt(l.conta_bancaria_id), public._fn_conc_conta_txt(l.conta_destino_id)) END)
      FROM financeiro_lancamentos_v2 l,
           LATERAL (SELECT public._fn_conc_ligado_na_conta(l.id, l.conta_bancaria_id) AS o, public._fn_conc_ligado_na_conta(l.id, l.conta_destino_id) AS d) x
     WHERE l.id = p_lanc) END
$$;

REVOKE ALL ON FUNCTION public._fn_conc_eh_transf(uuid), public._fn_conc_mesma_ponta(uuid, uuid, uuid), public._fn_conc_ligado_na_conta(uuid, uuid),
  public._fn_conc_aplicado_na_conta(uuid, uuid), public._fn_conc_transf_pontas(uuid) FROM PUBLIC, anon;
-- `fn_ws_candidatos_financeiros` e' SECURITY INVOKER: o logado precisa executar (as tabelas seguem com a RLS dele)
GRANT EXECUTE ON FUNCTION public._fn_conc_eh_transf(uuid), public._fn_conc_mesma_ponta(uuid, uuid, uuid), public._fn_conc_ligado_na_conta(uuid, uuid),
  public._fn_conc_aplicado_na_conta(uuid, uuid), public._fn_conc_transf_pontas(uuid) TO authenticated;

-- ── troca exata no corpo vivo, guardada por md5 e pela contagem de cada trecho ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp._troca(p_fn regprocedure, p_md5 text, p_pares text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text := pg_get_functiondef(p_fn); i int; n int;
BEGIN
  IF md5(d) <> p_md5 THEN RAISE EXCEPTION '% mudou (md5 %, esperado %)', p_fn, md5(d), p_md5; END IF;
  FOR i IN 1..array_length(p_pares, 1) / 3 LOOP
    n := (SELECT count(*) FROM regexp_matches(d, p_pares[3*i-2], 'g'));
    IF n <> p_pares[3*i]::int THEN RAISE EXCEPTION '% trecho %: % ocorrencias, esperado %', p_fn, i, n, p_pares[3*i]; END IF;
    d := regexp_replace(d, p_pares[3*i-2], p_pares[3*i-1], 'g');
  END LOOP;
  EXECUTE d;
END $$;

-- 1:1 — a transferencia vale por ponta mesmo sem `p_dupla_ponta` (guarda e saldo livre)
SELECT pg_temp._troca('public.fn_vincular_extrato_lancamento(uuid,uuid,numeric,boolean)', 'a931dfd876f6b6a337af3693f6d1f6df', ARRAY[
  $p$\(NOT p_dupla_ponta OR EXISTS$p$, $r$(NOT (p_dupla_ponta OR public._fn_conc_eh_transf(p_lancamento_id)) OR EXISTS$r$, '2']);

-- grupo
SELECT pg_temp._troca('public.fn_vincular_grupo_conciliacao(uuid,uuid[],numeric[],text)', '1582058eedec3006dbf9d742fd778ea3', ARRAY[
  $p$WHERE c\.lancamento_id = v_lanc AND c\.desfeito_em IS NULL(\s+\) THEN RAISE EXCEPTION USING MESSAGE = format\('O lançamento %s já está ligado a outro)$p$,
  $r$WHERE c.lancamento_id = v_lanc AND c.desfeito_em IS NULL AND public._fn_conc_mesma_ponta(v_lanc, c.extrato_id, p_extrato_id)\1$r$, '1']);

-- Casar com o banco 1:N
SELECT pg_temp._troca('public.fn_espelho_casar(uuid,jsonb,boolean,text)', '9fe06e3e016eefde1d81eba1492c8c9d', ARRAY[
  $p$WHERE lancamento_id = v_lid AND desfeito_em IS NULL\)$p$,
  $r$WHERE lancamento_id = v_lid AND desfeito_em IS NULL AND public._fn_conc_mesma_ponta(v_lid, extrato_id, p_extrato_id))$r$, '1']);

-- Casar com o banco N:1 — a guarda pela conta dos extratos levados, e a transferencia so' na ponta certa (saidas na origem, entradas no destino)
SELECT pg_temp._troca('public.fn_espelho_casar_n1(uuid,uuid[],boolean,text)', '5ab76889fa7c293767733ee452658d31', ARRAY[
  $p$WHERE lancamento_id = p_lancamento_id AND desfeito_em IS NULL\) THEN$p$,
  $r$WHERE lancamento_id = p_lancamento_id AND desfeito_em IS NULL AND public._fn_conc_mesma_ponta(p_lancamento_id, extrato_id, p_extratos[1])) THEN$r$, '1',
  $p$(\n\s*IF abs\(v_soma - abs\(v_lan\.valor\)\) > 0\.005 THEN)$p$,
  $r$
  IF public._fn_conc_eh_transf(p_lancamento_id) AND NOT (
       (v_conta = v_lan.conta_bancaria_id AND NOT EXISTS (SELECT 1 FROM extrato_bancario_v2 x WHERE x.id = ANY(v_ids) AND x.valor > 0))
    OR (v_conta = v_lan.conta_destino_id  AND NOT EXISTS (SELECT 1 FROM extrato_bancario_v2 x WHERE x.id = ANY(v_ids) AND x.valor < 0))) THEN
    RETURN public._fn_conc_frase_casar('direcao_indefinida', p_lancamento_id, NULL) || jsonb_build_object('ok', false, 'motivo', 'direcao_indefinida');
  END IF;\1$r$, '1']);

-- bloco — saldo livre, conta e direcao da transferencia pela ponta do extrato
SELECT pg_temp._troca('public.fn_conciliar_bloco(uuid[],uuid[],text,boolean)', 'b905c6af3cadb512c13022046160b3da', ARRAY[
  $p$abs\(l\.valor\) - coalesce\(\(SELECT sum\(c\.valor_aplicado\) FROM conciliacao_bancaria_itens c\s+WHERE c\.lancamento_id = l\.id AND c\.desfeito_em IS NULL\), 0\) AS saldo_livre$p$,
  $r$abs(l.valor) - public._fn_conc_aplicado_na_conta(l.id, v_conta) AS saldo_livre$r$, '1',
  $p$IF r\.conta_efetiva_id IS DISTINCT FROM v_conta THEN$p$,
  $r$IF r.conta_efetiva_id IS DISTINCT FROM v_conta AND NOT (public._fn_conc_eh_transf(r.id) AND v_conta IN (r.conta_bancaria_id, r.conta_destino_id)) THEN$r$, '1',
  $p$(\n\s*v_d := CASE WHEN \(v_sinal_ext < 0 AND r\.sinal)$p$,
  $r$
    -- CONC-TRANSF-DUAS-PONTAS-01: a transferencia e' saida na origem e entrada no destino
    IF public._fn_conc_eh_transf(r.id) THEN r.sinal := CASE WHEN v_conta = r.conta_destino_id THEN '1' ELSE '-1' END; END IF;\1$r$, '1']);

-- "Ligar os exatos do mes" (a sugestao automatica em lote): a outra ponta nao tira a transferencia do casamento desta conta
SELECT pg_temp._troca('public.fn_vincular_exatos_mes(uuid,uuid,date,date,boolean)', '22641a5a465e8ebf0c73dc2f4e2a9ff9', ARRAY[
  $p$AND NOT EXISTS \(SELECT 1 FROM public\.conciliacao_bancaria_itens ci\s+WHERE ci\.lancamento_id = fl\.id AND ci\.desfeito_em IS NULL\)$p$,
  $r$AND NOT public._fn_conc_ligado_na_conta(fl.id, p_conta_bancaria_id)$r$, '1']);

-- o conciliar do mes
SELECT pg_temp._troca('public.fn_extrato_conciliar_mes(uuid,uuid,text,boolean,integer,uuid[])', '1db808c05fc67d9b16812639c48b0669', ARRAY[
  $p$AND NOT EXISTS \(SELECT 1 FROM conciliacao_bancaria_itens c WHERE c\.lancamento_id = l\.id AND c\.desfeito_em IS NULL\)$p$,
  $r$AND NOT public._fn_conc_ligado_na_conta(l.id, p_conta_bancaria_id)$r$, '3']);

-- Conferencia: o lado do sistema conciliado POR CONTA; o vinculo da outra ponta nao aparece nesta conta; a frase das pontas
SELECT pg_temp._troca('public.fn_extratos_espelhados(uuid,uuid,text)', 'fd8f0c7cbf9ac7334d814d9dc86b504d', ARRAY[
  $p$CASE WHEN EXISTS\(SELECT 1 FROM conciliacao_bancaria_itens cbi WHERE cbi\.lancamento_id=s\.id AND cbi\.desfeito_em IS NULL\) THEN 'conciliado'$p$,
  $r$CASE WHEN public._fn_conc_ligado_na_conta(s.id, p_conta) THEN 'conciliado'$r$, '1',
  $p$EXISTS\(SELECT 1 FROM conciliacao_bancaria_itens cbi WHERE cbi\.lancamento_id = l\.id AND cbi\.desfeito_em IS NULL\) AS ja_conciliado$p$,
  $r$public._fn_conc_ligado_na_conta(l.id, pp.conta) AS ja_conciliado$r$, '1',
  $p$OR cbi\.lancamento_id IN \(SELECT id FROM lv2\)\)$p$,
  $r$OR (cbi.lancamento_id IN (SELECT id FROM lv2) AND NOT public._fn_conc_eh_transf(cbi.lancamento_id)))$r$, '1',
  $p$'oc_parcela',oc_parcela\) ORDER BY dt, id\),'\[\]'::jsonb\) FROM sis_status$p$,
  $r$'oc_parcela',oc_parcela,'pontas',public._fn_conc_transf_pontas(id)) ORDER BY dt, id),'[]'::jsonb) FROM sis_status$r$, '1']);

-- candidatos da Estacao: "ligado a outro" so' na mesma ponta
SELECT pg_temp._troca('public.fn_ws_candidatos_financeiros(uuid)', 'cc07902f7d6d8f47bb5fcd67104fbe49', ARRAY[
  $p$AND c\.extrato_id <> p_extrato_id\) AS cbi_outro$p$,
  $r$AND c.extrato_id <> p_extrato_id AND public._fn_conc_mesma_ponta(l.id, c.extrato_id, p_extrato_id)) AS cbi_outro$r$, '1',
  $p$WHERE c\.lancamento_id = l\.id AND c\.desfeito_em IS NULL\) AS cbi_qualquer$p$,
  $r$WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL AND public._fn_conc_mesma_ponta(l.id, c.extrato_id, p_extrato_id)) AS cbi_qualquer$r$, '1']);
