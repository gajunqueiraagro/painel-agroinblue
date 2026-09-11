-- 20260911203500_agri_02_campos_variedade.sql
-- AGRI-02-CAMPOS: variedade e densidade de plantio na area plantada, para o painel da
-- safra (raio-x do ciclo). Texto livre por enquanto; a validacao/lista fica para a tela.
-- APLICADA no proto em 2026-09-11 via Management API, apos ROLLBACK.
alter table agri_safra_area
  add column if not exists variedade text,
  add column if not exists densidade_plantio text;
comment on column agri_safra_area.variedade is 'Variedade/cultivar da cultura naquele talhao (ex.: IAC OL3, BRS 421). Texto livre.';
comment on column agri_safra_area.densidade_plantio is 'Populacao/densidade de plantio (ex.: 18/m2, 12 sem/m). Texto livre por enquanto.';
