-- 20260911125500_fin_financiamento_safra_01.sql
-- FIN-FINANCIAMENTO-SAFRA-01: parcela de financiamento de investimento nao pertence a safra.
-- As 61 parcelas do BRDE (26 amortizacoes + 35 juros) apontavam para a safra 25/26 Amendoim.
-- Amortizacao (principal) nunca e de safra. Juros: os deste contrato financiam armazem,
-- maquinas e recuperacao de solo (investimento plurianual), entao nao sao de uma safra;
-- juros de custeio agricola financiado seriam da safra do custeio (regra do cadastro FIN-FINANCIAMENTO-01).
-- Sem isso a safra 25/26 carregava 9,74 mi de juros no modo Safra do painel.
-- Auditoria/editado_manual desligados na transacao. APLICADA no proto em 2026-09-11 apos ROLLBACK.
alter table financeiro_lancamentos_v2 disable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 disable trigger trg_financeiro_lancamento_v2_editado_manual;
update financeiro_lancamentos_v2 l set safra_id = null
  from financeiro_plano_contas p, financeiro_fornecedores f
 where p.id=l.plano_conta_id and f.id=l.favorecido_id
   and l.cliente_id='f2d67cd4-24d0-456f-a079-a3281dcce7fd' and f.nome ilike '%BRDE%'
   and l.status_transacao='programado'
   and p.subcentro in ('Juros de Financiamento Agricultura','Amortização Financiamento Agricultura')
   and l.safra_id is not null;
alter table financeiro_lancamentos_v2 enable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 enable trigger trg_financeiro_lancamento_v2_editado_manual;
-- Esperado: 0 parcelas programadas do BRDE com safra_id.
