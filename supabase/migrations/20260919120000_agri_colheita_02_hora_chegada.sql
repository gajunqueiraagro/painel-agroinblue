-- 20260919120000_agri_colheita_02_hora_chegada.sql
-- AGRI-COLHEITA-02: a hora em que o caminhão chegou à balança da cooperativa.
--
-- ⚠ ESTE ARQUIVO VERSIONA O QUE JA' ESTA' VIVO NO PROTO. A coluna foi aplicada pelo Chat via
--   Management API sob GO, antes de existir migration; o arquivo existe para o historico
--   deixar de mentir. Nao se reaplica por ele.
--   Conferido em pg_attribute, 13/09/2026: `hora_chegada` existe como `time without time zone`,
--   que e' o que o `time` abaixo produz.
--
-- ⚠ O `comment on column` AINDA NAO ESTA' NO BANCO. Medido no mesmo dia:
--   `col_description('public.agri_colheita'::regclass, attnum)` devolve NULL para esta coluna —
--   quem aplicou rodou so' o `alter table`. A linha fica aqui porque e' o estado que esta
--   migration DESCREVE; quem rodar o historico do zero terá o comentario, e o Proto ficará com
--   ele na proxima aplicacao autorizada. Registrado para nao virar surpresa numa auditoria de
--   catalogo.
--
-- O ROMANEIO TRAZ "DATA HORA CHEGADA" (ex.: 04/04/2024 14:55:00) e a data ja' tem coluna
-- propria (`data_colheita`), entao aqui entra so' a hora — `time`, nao `timestamptz`: nao ha
-- fuso a converter num horario de balanca, e um timestamp completo duplicaria a data.
-- ⚠ O CAMINHAO NAO ENTRA (decisao do Gabriel): a placa ja' esta' no ticket de balanca.

alter table public.agri_colheita add column if not exists hora_chegada time;
comment on column public.agri_colheita.hora_chegada is 'hora de chegada da carga na cooperativa (do romaneio)';
