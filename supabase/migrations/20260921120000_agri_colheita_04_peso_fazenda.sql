-- 20260921120000_agri_colheita_04_peso_fazenda.sql
-- AGRI-COLHEITA-04: o peso que saiu da balanca da fazenda, antes da viagem.
--
-- ⚠ ESTE ARQUIVO VERSIONA O QUE JA' ESTA' VIVO NO PROTO. A coluna foi aplicada pelo Chat via
--   Management API sob GO, antes de existir migration; o arquivo existe para o historico deixar
--   de mentir. Nao se reaplica por ele.
--   Conferido em pg_attribute e col_description, 13/09/2026: `peso_fazenda_kg` existe como
--   `numeric`, nulavel, e o comentario abaixo e' o do catalogo, copiado de la' — nao redigitado.
--
-- SAO TRES PESOS DA MESMA CARGA, e nenhum deriva do outro:
--   `peso_fazenda_kg`  o que saiu da balanca da fazenda/posto;
--   `peso_verde_kg`    o que a Casul pesou na chegada — a diferenca para o de cima e' a QUEBRA
--                      DE TRANSPORTE, que hoje ninguem media;
--   `peso_seco_kg`     o que voltou depois de secar — a diferenca para o verde e' a quebra de
--                      secagem, que a tela ja' mostra.
-- ⚠ A COLUNA E' SO' REGISTRO POR ORA. Nenhuma tela a le' ainda; a quebra de transporte entra
-- na analise de producao numa frente propria. Guardar o numero antes de saber o que fazer com
-- ele e' o certo aqui: o romaneio ja' o traz, e o que nao se grava na hora nao se recupera.

alter table public.agri_colheita add column if not exists peso_fazenda_kg numeric;
comment on column public.agri_colheita.peso_fazenda_kg is 'peso de saida na balanca da fazenda/posto (do romaneio); a diferenca para peso_verde_kg (Casul) e a quebra de transporte';
