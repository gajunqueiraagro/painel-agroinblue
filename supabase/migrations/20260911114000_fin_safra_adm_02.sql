-- 20260911114000_fin_safra_adm_02.sql
-- FIN-SAFRA-ADM-02: lancamento administrativo nao tem safra (regra do FIN-SAFRA-ADM-01).
-- (1) Entrada e Amortizacao de Financiamento de Agricultura/Pecuaria deixam de ser
--     escopo administrativo: financiamento e dinheiro de uma atividade e TEM safra.
--     Com isso a regra fica sem excecao. As copias de escopo nos lancamentos seguem.
-- (2) safra_id = NULL em todo lancamento nao cancelado cujo plano continua administrativo,
--     todos os clientes. Auditoria e editado_manual desligados so nesta transacao.
-- APLICADA no proto em 2026-09-11 10:48 via Management API, apos teste em ROLLBACK.
update financeiro_plano_contas set escopo_negocio='agricultura', updated_at=now()
 where cliente_id is null and subcentro in ('Entrada de Financiamento Agricultura','Amortização Financiamento Agricultura');
update financeiro_plano_contas set escopo_negocio='pecuaria', updated_at=now()
 where cliente_id is null and subcentro in ('Entrada de Financiamento Pecuária','Amortização Financiamento Pecuária');
alter table financeiro_lancamentos_v2 disable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 disable trigger trg_financeiro_lancamento_v2_editado_manual;
update financeiro_lancamentos_v2 l set escopo_negocio = p.escopo_negocio
  from financeiro_plano_contas p where p.id=l.plano_conta_id and p.cliente_id is null
   and p.subcentro in ('Entrada de Financiamento Agricultura','Amortização Financiamento Agricultura','Entrada de Financiamento Pecuária','Amortização Financiamento Pecuária')
   and l.escopo_negocio is distinct from p.escopo_negocio;
update financeiro_lancamentos_v2 l set safra_id = null
  from financeiro_plano_contas p where p.id=l.plano_conta_id and p.escopo_negocio='administrativo'
   and l.safra_id is not null and coalesce(l.cancelado,false)=false;
alter table financeiro_lancamentos_v2 enable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 enable trigger trg_financeiro_lancamento_v2_editado_manual;
-- Esperado apos aplicar: administrativos com safra = 0; plano administrativo 50 -> 46.
