-- Corrigir registros antigos onde area_produtiva_ha está null
UPDATE fazenda_cadastros
SET area_produtiva_ha = COALESCE(area_pecuaria_ha, 0) + COALESCE(area_agricultura_ha, 0)
WHERE area_produtiva_ha IS NULL;
-- Garantir que não existam valores negativos ou inconsistentes
-- (não alterar valores já preenchidos)
