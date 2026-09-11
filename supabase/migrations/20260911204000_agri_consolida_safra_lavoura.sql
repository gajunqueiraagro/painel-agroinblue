-- 20260911204000_agri_consolida_safra_lavoura.sql
-- AGRI-CONSOLIDA-SAFRA-01: no modelo de 3 camadas a safra e o periodo e a cultura e da
-- area, entao as safras por cultura (25/26-AMD, 25/26-MAND, etc.) sao redundancia. Os
-- lancamentos delas passam para a safra -Lav da mesma temporada, e as safras por cultura
-- sao inativadas (nao apagadas: historia). A cultura passa a viver so em agri_safra_area.
-- 1.168 lancamentos re-apontados no NJ. Auditoria/editado_manual desligados na transacao.
-- APLICADA no proto em 2026-09-11 via Management API, apos ROLLBACK.
alter table financeiro_lancamentos_v2 disable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 disable trigger trg_financeiro_lancamento_v2_editado_manual;
update financeiro_lancamentos_v2 set safra_id='7a14f96a-353a-4065-950c-2891d360dc2e' where safra_id='21148f03-3402-46bb-9e72-6fa911c59b86' and coalesce(cancelado,false)=false;
update financeiro_lancamentos_v2 set safra_id='5df2fb02-d2df-4f82-90d7-1e47cd48ecd7' where safra_id='386dd7df-b3d7-48b9-915a-083464150c01' and coalesce(cancelado,false)=false;
update financeiro_lancamentos_v2 set safra_id='55d99920-add0-4091-b1a7-0b0ce3faaedb' where safra_id in ('00755f23-7f06-46f4-8856-4530f9a7baf5','72a59131-fe23-4b92-9b4d-2cdaeda67ec1') and coalesce(cancelado,false)=false;
update financeiro_lancamentos_v2 set safra_id='5c9e3439-564d-4116-9787-fbae474dd4c1' where safra_id='f3d053d5-bea4-4ee8-9380-a725177eb86d' and coalesce(cancelado,false)=false;
update financeiro_safras set ativa=false where id in ('21148f03-3402-46bb-9e72-6fa911c59b86','386dd7df-b3d7-48b9-915a-083464150c01','00755f23-7f06-46f4-8856-4530f9a7baf5','72a59131-fe23-4b92-9b4d-2cdaeda67ec1','f3d053d5-bea4-4ee8-9380-a725177eb86d');
alter table financeiro_lancamentos_v2 enable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 enable trigger trg_financeiro_lancamento_v2_editado_manual;
