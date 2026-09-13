-- 20260920120000_agri_colheita_03_secagem.sql
-- AGRI-COLHEITA-03: a secagem que a cooperativa cobra por carga.
--
-- ⚠ ESTE ARQUIVO VERSIONA O QUE JA' ESTA' VIVO NO PROTO. As colunas foram aplicadas pelo Chat
--   via Management API sob GO, antes de existir migration; o arquivo existe para o historico
--   deixar de mentir. Nao se reaplica por ele.
--   Conferido em pg_attribute e col_description, 13/09/2026: as duas colunas existem como
--   `numeric`, nulaveis, e OS COMENTARIOS ABAIXO SAO OS DO CATALOGO, copiados de la' — nao
--   redigitados. (Diferente da AGRI-COLHEITA-02, cujo `comment on column` segue ausente no
--   banco; aqui os dois estao aplicados.)
--
-- SAO DOIS NUMEROS DO ROMANEIO, nenhum derivado do outro: a taxa e' o quanto a cooperativa
-- cobra (R$/saca ou %, como ela escrever) e o valor e' o que aquela carga pagou. Multiplicar um
-- pelo outro no front produziria um terceiro numero que o papel nao tem.
-- ⚠ POR ORA SO' REGISTRO. A secagem E' CUSTO e futuramente vira lancamento financeiro no
-- subcentro "Secagem e Beneficiamento" (13180) — frente propria, PR-COLHEITA-SECAGEM-FINANCEIRO.
-- Ate' la' o valor vive aqui e no consolidado da safra, sem tocar o DRE.

alter table public.agri_colheita add column if not exists taxa_secagem numeric;
alter table public.agri_colheita add column if not exists valor_secagem numeric;

comment on column public.agri_colheita.taxa_secagem is 'taxa de secagem cobrada pela cooperativa (do romaneio); registro, ainda nao vira lancamento financeiro';
comment on column public.agri_colheita.valor_secagem is 'valor em R$ da secagem da carga (do romaneio); futuramente custo no DRE (subcentro Secagem e Beneficiamento)';
