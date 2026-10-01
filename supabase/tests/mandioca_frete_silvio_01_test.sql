-- MANDIOCA-FRETE-SILVIO-01 — teste do backfill dos fretes (Andre -> Silvio, motorista na observacao).
-- Roda em ROLLBACK: termina em RAISE, nada fica gravado. Le o estado DEPOIS do backfill (no ensaio, logo apos a migration).
-- P1 as 19 linhas do backfill: soma 56.268,80, todas no Silvio, todas com "Motorista: Andre Dias da Rocha" no fim da
--    observacao, a observacao de antes preservada no comeco; nenhuma com vinculo vivo; valor/data/conta/plano/status iguais.
-- P2 fretes do NJ: Silvio = 33 (7 conciliados + 26 abertos), abertos somam 77.184,80; Andre = 0.
DO $teste$
DECLARE
  v_out text := '';
  c_nj     constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_andre  constant uuid := '3a67853a-07f1-42f7-9061-51ec15a71433';
  c_silvio constant uuid := '662feec2-419e-4ce0-9bf7-94600b7841b3';
  r record;
BEGIN
  -- ── P1
  SELECT count(*) n, sum(l.valor) soma,
         count(*) FILTER (WHERE l.favorecido_id = c_silvio) no_silvio,
         count(*) FILTER (WHERE l.observacao LIKE '%Motorista: Andre Dias da Rocha') com_motorista,
         count(*) FILTER (WHERE b.observacao_anterior IS NOT NULL AND l.observacao = b.observacao_anterior || ' · Motorista: Andre Dias da Rocha') obs_preservada,
         count(*) FILTER (WHERE b.observacao_anterior IS NOT NULL) tinham_obs,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL)) vivos
    INTO r
    FROM mandioca_frete_silvio_01_backfill b JOIN financeiro_lancamentos_v2 l ON l.id = b.lancamento_id;
  IF r.n = 0 THEN RAISE EXCEPTION 'P1 invalida: backfill vazio'; END IF;
  v_out := 'P1 backfill: ' || r.n || ' linhas, soma ' || r.soma || ' | no Silvio ' || r.no_silvio || ' | com motorista ' || r.com_motorista
    || ' | tinham obs ' || r.tinham_obs || ', preservadas ' || r.obs_preservada || ' | vinculos vivos ' || r.vivos;

  -- ── P2
  SELECT count(*) FILTER (WHERE l.favorecido_id = c_silvio) silvio,
         count(*) FILTER (WHERE l.favorecido_id = c_silvio AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL)) silvio_abertos,
         coalesce(sum(l.valor) FILTER (WHERE l.favorecido_id = c_silvio AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL)), 0) soma_abertos,
         count(*) FILTER (WHERE l.favorecido_id = c_silvio AND EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL)) silvio_conciliados,
         count(*) FILTER (WHERE l.favorecido_id = c_andre) andre
    INTO r
    FROM agri_colheita_lancamentos cl JOIN financeiro_lancamentos_v2 l ON l.id = cl.lancamento_id
   WHERE cl.papel = 'frete' AND cl.ativo AND l.cliente_id = c_nj AND l.cancelado IS NOT TRUE;
  v_out := v_out || E'\nP2 fretes: Silvio ' || r.silvio || ' (conciliados ' || r.silvio_conciliados || ', abertos ' || r.silvio_abertos
    || ' somando ' || r.soma_abertos || ') | Andre ' || r.andre;

  RAISE EXCEPTION 'ENSAIO (rollback): %', v_out;
END
$teste$;
