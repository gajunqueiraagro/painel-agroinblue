-- OC-DOC-ESPECIE-ABATE-01 passo 4c — o RAT ja' gravado passa ao tipo proprio, 'rat' (decisao do Gabriel, 15/10/2026).
-- Criterio do Gabriel: os componentes de NF com RAT ESCRITO NA DESCRICAO. Medido em 15/10 (tipo 'outros', retencao_sem_caixa,
-- vivos, documento NF vivo): os 4 abaixo, POR ID. Guarda: cada um no estado medido, ou ja' 'rat' — senao aborta sem gravar nada.
-- Idempotente: reaplicar muda 0 linhas. So' o `tipo` muda; natureza e valor nao — o liquido das 4 NFs nas duas views e' o mesmo
-- (conferido abaixo, antes x depois).
--   36db5a7a (OC 2d39d7e9, NF f5fa2c7e, "DESCONTO DA RAT", 115,18)
--   61f63242 (OC 02be1a41, NF 55fe3bff, "DESCONTO DA RAT", 411,27)
--   b0cd54fe (OC 96776ccb, NF a8e4a80a, "RAT", 269,68)
--   b345ea96 (OC 26fd02c1, NF 51aae43c, "RAT", 237,57)
-- GESTO CONTRARIO (escrito, nao executado):
--   UPDATE public.zoo_operacao_documento_componentes SET tipo = 'outros'
--    WHERE tipo = 'rat' AND id IN ('36db5a7a-2801-4f06-8a69-16c89bf7ebd6', '61f63242-da87-4144-a295-28e71928d45b',
--                                  'b0cd54fe-e5e1-457c-a972-03ce29451b55', 'b345ea96-849b-4eeb-963b-8ae2ca6eed88');

SET LOCAL lock_timeout = '2s';

DO $rat$
DECLARE
  n int; antes text; depois text; m int;
BEGIN
  CREATE TEMP TABLE _rat_medido (id uuid, documento_id uuid, valor numeric, descricao text) ON COMMIT DROP;
  INSERT INTO _rat_medido VALUES
    ('36db5a7a-2801-4f06-8a69-16c89bf7ebd6', 'f5fa2c7e-3817-4c88-82e7-86ea4123db42', 115.18, 'DESCONTO DA RAT'),
    ('61f63242-da87-4144-a295-28e71928d45b', '55fe3bff-606c-46ea-8b8b-33bd3d4a7830', 411.27, 'DESCONTO DA RAT'),
    ('b0cd54fe-e5e1-457c-a972-03ce29451b55', 'a8e4a80a-84fd-4a8f-bcec-b83639e61c86', 269.68, 'RAT'),
    ('b345ea96-849b-4eeb-963b-8ae2ca6eed88', '51aae43c-11c7-4e29-a1f5-f8ec85c0bd97', 237.57, 'RAT');

  SELECT count(*) INTO n FROM public.zoo_operacao_documento_componentes c JOIN _rat_medido r ON r.id = c.id
   WHERE c.documento_id = r.documento_id AND c.cancelado = false AND c.natureza = 'retencao_sem_caixa' AND c.valor = r.valor
     AND c.descricao = r.descricao AND c.tipo IN ('outros', 'rat');
  IF n IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01 passo 4c: % de 4 componentes de RAT no estado medido. Nada foi gravado.', n; END IF;

  -- o liquido das 4 NFs nas duas views, antes
  SELECT string_agg(x, ';' ORDER BY x) INTO antes FROM (
    SELECT 'oc:' || v.documento_id || '=' || v.liquido_proprio || '/' || v.valor_liquido AS x FROM public.vw_oc_documentos v
     WHERE v.documento_id IN (SELECT documento_id FROM _rat_medido)
    UNION ALL
    SELECT 'lanc:' || l.documento_id || ':' || l.lancamento_id || '=' || l.valor_documento FROM public.vw_lancamento_documentos l
     WHERE l.documento_id IN (SELECT documento_id FROM _rat_medido)) s;

  UPDATE public.zoo_operacao_documento_componentes c SET tipo = 'rat'
   WHERE c.id IN (SELECT id FROM _rat_medido) AND c.tipo = 'outros';
  GET DIAGNOSTICS m = ROW_COUNT;

  SELECT string_agg(x, ';' ORDER BY x) INTO depois FROM (
    SELECT 'oc:' || v.documento_id || '=' || v.liquido_proprio || '/' || v.valor_liquido AS x FROM public.vw_oc_documentos v
     WHERE v.documento_id IN (SELECT documento_id FROM _rat_medido)
    UNION ALL
    SELECT 'lanc:' || l.documento_id || ':' || l.lancamento_id || '=' || l.valor_documento FROM public.vw_lancamento_documentos l
     WHERE l.documento_id IN (SELECT documento_id FROM _rat_medido)) s;

  IF antes IS NULL OR antes IS DISTINCT FROM depois THEN
    RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01 passo 4c: o liquido das NFs mudou (antes % / depois %). Nada foi gravado.', antes, depois; END IF;
  IF (SELECT count(*) FROM public.zoo_operacao_documento_componentes WHERE id IN (SELECT id FROM _rat_medido) AND tipo = 'rat') IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01 passo 4c: conversao incompleta. Nada foi gravado.'; END IF;
  RAISE NOTICE 'passo 4c: % convertidos; liquido igual: %', m, depois;
END $rat$;
