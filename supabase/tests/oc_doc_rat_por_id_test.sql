-- OC-DOC-ESPECIE-ABATE-01 passo 4c — teste ao vivo (so' leitura) da conversao do RAT por id.
-- R1: os 4 componentes estao como 'rat', vivos, retencao_sem_caixa, com o valor medido.
-- R2: o liquido das 4 NFs e' o do ensaio de 15/10, nas duas views (vw_oc_documentos e vw_lancamento_documentos).
-- Termina em RAISE 'OK'. Compara com `is distinct from`.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $t$
DECLARE r record; n int;
BEGIN
  CREATE TEMP TABLE _esp (comp uuid, doc uuid, valor numeric, liquido numeric) ON COMMIT DROP;
  INSERT INTO _esp VALUES
    ('36db5a7a-2801-4f06-8a69-16c89bf7ebd6', 'f5fa2c7e-3817-4c88-82e7-86ea4123db42', 115.18, 103006.06),
    ('61f63242-da87-4144-a295-28e71928d45b', '55fe3bff-606c-46ea-8b8b-33bd3d4a7830', 411.27, 367783.40),
    ('b0cd54fe-e5e1-457c-a972-03ce29451b55', 'a8e4a80a-84fd-4a8f-bcec-b83639e61c86', 269.68, 265639.15),
    ('b345ea96-849b-4eeb-963b-8ae2ca6eed88', '51aae43c-11c7-4e29-a1f5-f8ec85c0bd97', 237.57, 212449.03);

  -- R1
  SELECT count(*) INTO n FROM public.zoo_operacao_documento_componentes c JOIN _esp e ON e.comp = c.id
   WHERE c.tipo = 'rat' AND c.cancelado = false AND c.natureza = 'retencao_sem_caixa' AND c.valor = e.valor AND c.documento_id = e.doc;
  IF n IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'R1: % de 4 componentes como rat', n; END IF;

  -- R2
  FOR r IN SELECT e.doc, e.liquido, v.liquido_proprio, v.valor_liquido FROM _esp e LEFT JOIN public.vw_oc_documentos v ON v.documento_id = e.doc LOOP
    IF r.liquido_proprio IS DISTINCT FROM r.liquido OR r.valor_liquido IS DISTINCT FROM r.liquido THEN
      RAISE EXCEPTION 'R2 vw_oc_documentos %: % / % (esperado %)', r.doc, r.liquido_proprio, r.valor_liquido, r.liquido; END IF;
  END LOOP;
  SELECT count(*) INTO n FROM _esp e JOIN public.vw_lancamento_documentos l ON l.documento_id = e.doc
   WHERE l.valor_documento IS DISTINCT FROM e.liquido;
  IF n IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'R2 vw_lancamento_documentos: % linhas com outro valor', n; END IF;
  SELECT count(*) INTO n FROM _esp e JOIN public.vw_lancamento_documentos l ON l.documento_id = e.doc;
  IF n IS DISTINCT FROM 16 THEN RAISE EXCEPTION 'R2 vw_lancamento_documentos: % linhas (esperado 16)', n; END IF;

  RAISE EXCEPTION 'OK';
END $t$;
ROLLBACK;
