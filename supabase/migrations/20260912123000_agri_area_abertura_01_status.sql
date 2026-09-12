-- 20260912123000_agri_area_abertura_01_status.sql
-- AGRI-AREA-ABERTURA-01: estado da area de lavoura. "abertura" e' a area que AINDA NAO
-- PLANTOU — o caso do P5, em abertura desde fev/2026 para plantar em out/2026: nao ha data de
-- plantio, variedade, densidade nem colheita, e o formulario que insiste faz o cliente
-- inventar dado ou desistir.
-- ⚠ O ESTADO NAO MUDA CONTA NENHUMA. Em abertura o gasto e' FORMACAO DE AREA, que ja' e'
-- investimento pelo grupo de conta, e a fn_dre_agricola_por_safra ja' o poe abaixo da linha de
-- resultado. A coluna e' cadastro e apresentacao; a RPC nao a le', e nao deve.
-- ⚠ SEM BACKFILL, E O DEFAULT E' QUEM CUIDA DISSO: as areas que existiam (Ind 01, Ind 04,
-- IND.05) sao plantadas de verdade, e `default 'plantada'` ja' as cobre sem tocar em nenhuma.
-- ⚠ `cultura` e `area_plantada_ha` CONTINUAM NOT NULL: em abertura ainda se declara a cultura
-- pretendida e os hectares — sem isso a area nao entra em denominador nenhum.
-- APLICADA no proto em 2026-09-12 pelo Chat via MCP (status 201). Conferido depois: coluna
-- text NOT NULL default 'plantada', CHECK com os dois valores, e as areas existentes todas em
-- 'plantada', nenhuma tocada.
alter table agri_safra_area
  add column status text not null default 'plantada'
  check (status in ('abertura','plantada'));
