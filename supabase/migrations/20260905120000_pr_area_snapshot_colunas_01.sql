-- PR-AREA-SNAPSHOT-COLUNAS-01 — APP e Silvicultura em fechamento_area_snapshot.
--
-- APP: a origem (fazenda_cadastros) sempre teve area_app_ha propria; o snapshot nao
-- tinha, e a granularidade se perdia ao congelar.
--
-- SILVICULTURA: eucalipto virou familia propria no PR-SILVICULTURA-01 e nao tinha
-- coluna aqui. Consequencia medida na Faz. Sta. Luzia: nos 79 meses ja fechados o
-- eucalipto foi fotografado em area_agricultura_ha, porque na epoca era assim que se
-- classificava. Hoje o PainelConsultorTab monta AGRICULTURA a partir do snapshot e
-- SILVICULTURA a partir dos pastos ao vivo — o mesmo hectare aparece nas duas e a
-- AREA TOTAL soma 822,93 duas vezes. O codigo esta certo; faltava onde guardar.
--
-- Area produtiva = pecuaria + agricultura + silvicultura (decisao de produto,
-- 19/08/2026). Ambiental e infraestrutura ficam fora.
--
-- numeric(10,2): mesmo tipo das demais colunas de area desta tabela, conferido.
-- Sem UPDATE, sem backfill, sem DEFAULT: os 79 meses da Sta. Luzia seguem com o
-- valor em area_agricultura_ha. A correcao historica e regeneracao de snapshot,
-- frente propria. fn_gerar_area_de_snapshot NAO e alterada aqui.

ALTER TABLE public.fechamento_area_snapshot
  ADD COLUMN IF NOT EXISTS area_app_ha numeric(10,2),
  ADD COLUMN IF NOT EXISTS area_silvicultura_ha numeric(10,2);

COMMENT ON COLUMN public.fechamento_area_snapshot.area_app_ha IS
  'APP congelada no fechamento. A origem (fazenda_cadastros) sempre teve coluna propria; o snapshot nao tinha e a granularidade se perdia.';
COMMENT ON COLUMN public.fechamento_area_snapshot.area_silvicultura_ha IS
  'Silvicultura congelada no fechamento. Familia propria desde PR-SILVICULTURA-01. Sem esta coluna o eucalipto era fotografado em area_agricultura_ha, e a tela somava o mesmo hectare duas vezes (Sta. Luzia, 79 meses). Silvicultura conta como area produtiva por decisao de produto de 19/08/2026.';
