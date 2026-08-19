-- PR-AREA-CADASTRO-COLUNAS-01 — duas colunas em fazenda_cadastros.
--
-- roteiro: o campo existe na CadastrosTab legada apontando para coluna inexistente
-- (uma das chaves que quebram o handleSave daquela tela). A aba Cadastro do
-- V2Fazendas vai oferece-lo e precisa de onde gravar.
--
-- matricula_conferida_em: area_total_ha virou a area da MATRICULA no
-- PR-AREA-MATRICULA-01, mas as 12 fazendas ja tinham valor la — o residuo do
-- calculo antigo (soma das seis colunas de area). Em 9 delas esse residuo coincide
-- com a soma dos pastos, e a tela mostraria diferenca zero em verde: conferencia
-- APARENTE onde ninguem conferiu. A marcacao separa "o numero bate" de "o numero
-- foi verificado".
--
-- Sem UPDATE, sem backfill, sem DEFAULT: nenhum dado tocado.

ALTER TABLE public.fazenda_cadastros
  ADD COLUMN IF NOT EXISTS roteiro text,
  ADD COLUMN IF NOT EXISTS matricula_conferida_em timestamptz;

COMMENT ON COLUMN public.fazenda_cadastros.roteiro IS
  'Roteiro de acesso a fazenda. Texto livre.';
COMMENT ON COLUMN public.fazenda_cadastros.matricula_conferida_em IS
  'Quando area_total_ha foi conferida contra a matricula pelo operador. NULL = nunca conferida. Distingue "o numero bate" de "o numero foi verificado": as 12 fazendas herdaram em area_total_ha o residuo do calculo antigo, que coincide com a soma dos pastos em 9 delas.';
