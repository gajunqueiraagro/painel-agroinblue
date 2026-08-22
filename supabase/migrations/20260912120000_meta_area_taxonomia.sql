-- PR-META-AREA-TAXONOMIA-01 — a Meta de area passa a espelhar o Real.
--
-- O PROBLEMA. `planejamento_area_meta` tinha taxonomia propria e incompleta:
-- agrupava reserva+APP em `area_ambiental_ha`, chamava benfeitorias de
-- `area_infraestrutura_ha`, e nao tinha silvicultura nem outras. Sem simetria
-- com `fechamento_area_snapshot`, o PC-100 nao consegue expor `vs META` por
-- destino, e a silvicultura — que virou atividade propria em 21/08 — nao tem
-- meta nenhuma.
--
-- POR QUE RENOMEAR E SEGURO. Medido em 22/08/2026: `area_ambiental_ha` e
-- `area_infraestrutura_ha` estao ZERADAS em 132 de 132 linhas. A causa nao e
-- so a tela nao edita-las: elas sao NOT NULL DEFAULT 0, entao zero e o unico
-- valor possivel para quem nunca informou. Renomear nao move dado nenhum.
--
-- ORDEM OBRIGATORIA. `area_total_ha` e coluna GENERATED que soma as parcelas.
-- Ela precisa SAIR antes de as parcelas mudarem de nome e de nulidade, e
-- VOLTAR depois com as sete. Conferido no schema baseline: nenhuma view ou
-- funcao referencia `area_total_ha` — so indices (em cliente/ano e
-- fazenda/ano/mes), o trigger de updated_at e as policies de RLS, nenhum
-- deles dependente da coluna gerada.
--
-- NULL x ZERO. NULL passa a significar "nao planejado"; 0, "planejado como
-- zero". A distincao importa para o `vs META`, que deve mostrar "—" quando
-- nao ha meta, nao "-100%".
--
-- Tipo: `numeric` sem precisao declarada, igual as irmas.

BEGIN;

-- 1. Remover a coluna gerada (recriada no passo 6 com as sete parcelas).
ALTER TABLE public.planejamento_area_meta DROP COLUMN area_total_ha;

-- 2. Renomear para a taxonomia do Real.
ALTER TABLE public.planejamento_area_meta RENAME COLUMN area_ambiental_ha      TO area_reserva_ha;
ALTER TABLE public.planejamento_area_meta RENAME COLUMN area_infraestrutura_ha TO area_benfeitorias_ha;

-- 3. Colunas novas, nullable, mesmo tipo das irmas.
ALTER TABLE public.planejamento_area_meta
  ADD COLUMN area_silvicultura_ha numeric,
  ADD COLUMN area_app_ha          numeric,
  ADD COLUMN area_outras_ha       numeric;

-- 4. Uniformizar nulidade: NULL = "nao planejado", 0 = "planejado zero".
ALTER TABLE public.planejamento_area_meta
  ALTER COLUMN area_pecuaria_ha     DROP NOT NULL,
  ALTER COLUMN area_pecuaria_ha     DROP DEFAULT,
  ALTER COLUMN area_agricultura_ha  DROP NOT NULL,
  ALTER COLUMN area_agricultura_ha  DROP DEFAULT,
  ALTER COLUMN area_reserva_ha      DROP NOT NULL,
  ALTER COLUMN area_reserva_ha      DROP DEFAULT,
  ALTER COLUMN area_benfeitorias_ha DROP NOT NULL,
  ALTER COLUMN area_benfeitorias_ha DROP DEFAULT;

-- 5. Zeros de reserva e benfeitorias viram NULL: a tela NUNCA permitiu
--    edita-las, entao 0 ali so pode ser o DEFAULT, nao planejamento.
--    Pecuaria e agricultura NAO sao tocadas — o zero delas pode ser real,
--    e nao ha como distinguir planejamento zero de ausencia de planejamento.
UPDATE public.planejamento_area_meta
   SET area_reserva_ha = NULL
 WHERE area_reserva_ha = 0;

UPDATE public.planejamento_area_meta
   SET area_benfeitorias_ha = NULL
 WHERE area_benfeitorias_ha = 0;

-- 6. Total refeito com as SETE parcelas. COALESCE e obrigatorio: coluna
--    gerada com parcela NULL produziria NULL no total inteiro.
ALTER TABLE public.planejamento_area_meta
  ADD COLUMN area_total_ha numeric GENERATED ALWAYS AS (
    COALESCE(area_pecuaria_ha, 0) + COALESCE(area_agricultura_ha, 0)
  + COALESCE(area_silvicultura_ha, 0)
  + COALESCE(area_reserva_ha, 0) + COALESCE(area_app_ha, 0)
  + COALESCE(area_benfeitorias_ha, 0) + COALESCE(area_outras_ha, 0)
  ) STORED;

-- 7. CHECKs: renomear os dois antigos, criar para as tres novas.
--    Nomes conferidos no schema baseline (20260714), linhas 10355-10356.
ALTER TABLE public.planejamento_area_meta
  RENAME CONSTRAINT planejamento_area_meta_area_ambiental_ha_check
                 TO planejamento_area_meta_area_reserva_ha_check;

ALTER TABLE public.planejamento_area_meta
  RENAME CONSTRAINT planejamento_area_meta_area_infraestrutura_ha_check
                 TO planejamento_area_meta_area_benfeitorias_ha_check;

ALTER TABLE public.planejamento_area_meta
  ADD CONSTRAINT planejamento_area_meta_area_silvicultura_ha_check CHECK (area_silvicultura_ha >= 0),
  ADD CONSTRAINT planejamento_area_meta_area_app_ha_check          CHECK (area_app_ha >= 0),
  ADD CONSTRAINT planejamento_area_meta_area_outras_ha_check       CHECK (area_outras_ha >= 0);

-- 8. COMMENT da tabela. O texto anterior citava as colunas que deixaram de
--    existir: 'Area META oficial por fazenda/ano/mes. area_total_ha gerado pelo
--    banco. V1 da tela edita apenas pec/agric; ambiental e infraestrutura
--    preparados para fases futuras.'
COMMENT ON TABLE public.planejamento_area_meta IS
  'Meta de area por fazenda/mes. Taxonomia espelha fechamento_area_snapshot:
   pecuaria, agricultura, silvicultura, reserva, app, benfeitorias, outras.
   area_total_ha e GENERATED sobre as sete parcelas com COALESCE.
   NULL = nao planejado; 0 = planejado como zero. A distincao importa para
   o vs META, que deve mostrar "—" e nao "-100%" quando nao ha meta.';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (comentado)
--
-- ATENCAO: o passo 5 e IRREVERSIVEL em conteudo. Ele converteu 0 -> NULL em
-- reserva e benfeitorias; o rollback devolve 0 a TODAS as linhas dessas duas
-- colunas, que e o estado de 22/08/2026 (132/132 zeradas) mas nao seria mais
-- se alguem planejar reserva ou benfeitoria antes de reverter.
--
-- BEGIN;
--
-- ALTER TABLE public.planejamento_area_meta DROP COLUMN area_total_ha;
--
-- ALTER TABLE public.planejamento_area_meta
--   DROP CONSTRAINT planejamento_area_meta_area_silvicultura_ha_check,
--   DROP CONSTRAINT planejamento_area_meta_area_app_ha_check,
--   DROP CONSTRAINT planejamento_area_meta_area_outras_ha_check;
--
-- ALTER TABLE public.planejamento_area_meta
--   DROP COLUMN area_silvicultura_ha,
--   DROP COLUMN area_app_ha,
--   DROP COLUMN area_outras_ha;
--
-- UPDATE public.planejamento_area_meta SET area_reserva_ha      = 0 WHERE area_reserva_ha      IS NULL;
-- UPDATE public.planejamento_area_meta SET area_benfeitorias_ha = 0 WHERE area_benfeitorias_ha IS NULL;
-- UPDATE public.planejamento_area_meta SET area_pecuaria_ha     = 0 WHERE area_pecuaria_ha     IS NULL;
-- UPDATE public.planejamento_area_meta SET area_agricultura_ha  = 0 WHERE area_agricultura_ha  IS NULL;
--
-- ALTER TABLE public.planejamento_area_meta
--   ALTER COLUMN area_pecuaria_ha     SET DEFAULT 0,
--   ALTER COLUMN area_pecuaria_ha     SET NOT NULL,
--   ALTER COLUMN area_agricultura_ha  SET DEFAULT 0,
--   ALTER COLUMN area_agricultura_ha  SET NOT NULL,
--   ALTER COLUMN area_reserva_ha      SET DEFAULT 0,
--   ALTER COLUMN area_reserva_ha      SET NOT NULL,
--   ALTER COLUMN area_benfeitorias_ha SET DEFAULT 0,
--   ALTER COLUMN area_benfeitorias_ha SET NOT NULL;
--
-- ALTER TABLE public.planejamento_area_meta
--   RENAME CONSTRAINT planejamento_area_meta_area_reserva_ha_check
--                  TO planejamento_area_meta_area_ambiental_ha_check;
-- ALTER TABLE public.planejamento_area_meta
--   RENAME CONSTRAINT planejamento_area_meta_area_benfeitorias_ha_check
--                  TO planejamento_area_meta_area_infraestrutura_ha_check;
--
-- ALTER TABLE public.planejamento_area_meta RENAME COLUMN area_reserva_ha      TO area_ambiental_ha;
-- ALTER TABLE public.planejamento_area_meta RENAME COLUMN area_benfeitorias_ha TO area_infraestrutura_ha;
--
-- ALTER TABLE public.planejamento_area_meta
--   ADD COLUMN area_total_ha numeric GENERATED ALWAYS AS (
--     area_pecuaria_ha + area_agricultura_ha + area_ambiental_ha + area_infraestrutura_ha
--   ) STORED;
--
-- COMMENT ON TABLE public.planejamento_area_meta IS 'Area META oficial por fazenda/ano/mes. area_total_ha gerado pelo banco. V1 da tela edita apenas pec/agric; ambiental e infraestrutura preparados para fases futuras.';
--
-- COMMIT;
