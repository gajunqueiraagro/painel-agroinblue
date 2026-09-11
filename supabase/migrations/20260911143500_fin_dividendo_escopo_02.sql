-- 20260911143500_fin_dividendo_escopo_02.sql
-- FIN-DIVIDENDO-ESCOPO-02: dividendos gravados com escopo pecuaria (e safra) pela constante
-- errada do front (corrigida em b8470982). Nao tem chave de plano (subcentros legados), entao
-- as limpezas por JOIN na chave nao os alcancam e o trigger os isenta: predicado por macro,
-- escrita direta de escopo e safra. Auditoria e editado_manual desligados so nesta transacao.
-- APLICADA no proto em 2026-09-11 via Management API, apos teste em ROLLBACK (53 linhas).
alter table financeiro_lancamentos_v2 disable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 disable trigger trg_financeiro_lancamento_v2_editado_manual;
update financeiro_lancamentos_v2 set escopo_negocio='administrativo', safra_id=null
 where macro_custo='Dividendos' and coalesce(cancelado,false)=false
   and (escopo_negocio is distinct from 'administrativo' or safra_id is not null);
alter table financeiro_lancamentos_v2 enable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 enable trigger trg_financeiro_lancamento_v2_editado_manual;
