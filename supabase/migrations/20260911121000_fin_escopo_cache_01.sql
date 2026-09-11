-- 20260911121000_fin_escopo_cache_01.sql
-- FIN-ESCOPO-CACHE-01: escopo_negocio do lancamento e cache do escopo do plano.
-- 5.114 lancamentos (4 clientes) divergiam por copia velha (dividendos e transferencias
-- marcados como pecuaria; entradas de capital como 'financeiro', que nao existe no plano).
-- Auditoria e editado_manual desligados so nesta transacao.
-- APLICADA no proto em 2026-09-11 via Management API, apos teste em ROLLBACK.
alter table financeiro_lancamentos_v2 disable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 disable trigger trg_financeiro_lancamento_v2_editado_manual;
update financeiro_lancamentos_v2 l set escopo_negocio = p.escopo_negocio
  from financeiro_plano_contas p where p.id=l.plano_conta_id and coalesce(l.cancelado,false)=false
   and l.escopo_negocio is distinct from p.escopo_negocio;
alter table financeiro_lancamentos_v2 enable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 enable trigger trg_financeiro_lancamento_v2_editado_manual;
-- Esperado apos aplicar: 0 lancamentos nao cancelados com escopo diferente do plano.
