-- MANDIOCA-FRETE-SILVIO-01 — os fretes das cargas de mandioca do NJ passam para o Silvio; o motorista vai na observacao.
--
-- Decisao do Gabriel (planilha da Amanda, 01/10): quem recebe o frete da mandioca e' Silvio Eduardo Azoia (662feec2);
-- Andre Dias da Rocha (3a67853a) e Joao sao motoristas dele. Medido no proto em 01/10: 19 lancamentos de papel 'frete'
-- (elo ativo, nao cancelados) no Andre — 56.268,80, vencimentos 08/09 a 25/09, NENHUM conciliado, 7 com observacao; 14 no
-- Silvio (43.192,80, 7 conciliados). Os Pix ao Silvio no Sicredi Lavoura (09/09, 16/09, 23/09 = 59.539,20) esperam esses
-- fretes.
-- So' muda favorecido_id (Andre -> Silvio) e observacao (+ "Motorista: Andre Dias da Rocha", no fim, separada por " · ";
-- a que existe nao se apaga). Valor, data, conta, plano, status, descricao e os 14 do Silvio NAO mudam. A descricao
-- ("Frete Mandioca X t · NF Y") nao carrega o nome do motorista.
-- GUARDAS: exatamente 19 linhas, soma 56.268,80, zero vinculo vivo; divergiu, aborta.
-- GESTO CONTRARIO: mandioca_frete_silvio_01_backfill guarda o favorecido e a observacao de antes de cada linha.

CREATE TABLE public.mandioca_frete_silvio_01_backfill (
  lancamento_id        uuid PRIMARY KEY,
  favorecido_anterior  uuid NOT NULL,
  observacao_anterior  text,                 -- NULO = nao havia
  gesto_contrario      text NOT NULL,
  criado_em            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mandioca_frete_silvio_01_backfill ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mandioca_frete_silvio_01_backfill FROM PUBLIC, anon, authenticated;

DO $backfill$
DECLARE
  c_nj     constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_andre  constant uuid := '3a67853a-07f1-42f7-9061-51ec15a71433';
  c_silvio constant uuid := '662feec2-419e-4ce0-9bf7-94600b7841b3';
  c_motorista constant text := 'Motorista: Andre Dias da Rocha';
  v_n int; v_soma numeric; v_vivos int; v_upd int;
BEGIN
  CREATE TEMP TABLE _alvo ON COMMIT DROP AS
  SELECT l.id, l.favorecido_id, l.observacao, l.valor
    FROM agri_colheita_lancamentos cl
    JOIN financeiro_lancamentos_v2 l ON l.id = cl.lancamento_id
   WHERE cl.papel = 'frete' AND cl.ativo AND l.cliente_id = c_nj AND l.cancelado IS NOT TRUE AND l.favorecido_id = c_andre;

  SELECT count(*), coalesce(sum(valor), 0) INTO v_n, v_soma FROM _alvo;
  SELECT count(*) INTO v_vivos FROM conciliacao_bancaria_itens c JOIN _alvo a ON a.id = c.lancamento_id WHERE c.desfeito_em IS NULL;
  IF v_n <> 19 THEN RAISE EXCEPTION 'MANDIOCA-FRETE-SILVIO-01: esperava 19 fretes no Andre, achou %', v_n; END IF;
  IF round(v_soma, 2) <> 56268.80 THEN RAISE EXCEPTION 'MANDIOCA-FRETE-SILVIO-01: esperava soma 56.268,80, achou %', v_soma; END IF;
  IF v_vivos <> 0 THEN RAISE EXCEPTION 'MANDIOCA-FRETE-SILVIO-01: % vinculo(s) vivo(s) nos fretes do Andre — abortado', v_vivos; END IF;

  INSERT INTO public.mandioca_frete_silvio_01_backfill (lancamento_id, favorecido_anterior, observacao_anterior, gesto_contrario)
  SELECT id, favorecido_id, observacao, 'voltar favorecido_id e observacao aos valores desta linha'
    FROM _alvo;

  UPDATE financeiro_lancamentos_v2 l
     SET favorecido_id = c_silvio,
         observacao = CASE WHEN nullif(btrim(a.observacao), '') IS NULL THEN c_motorista
                           ELSE a.observacao || ' · ' || c_motorista END,
         updated_at = now()
    FROM _alvo a
   WHERE l.id = a.id AND l.favorecido_id = c_andre;
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd <> 19 THEN RAISE EXCEPTION 'MANDIOCA-FRETE-SILVIO-01: atualizou % linhas, esperava 19', v_upd; END IF;
END $backfill$;
