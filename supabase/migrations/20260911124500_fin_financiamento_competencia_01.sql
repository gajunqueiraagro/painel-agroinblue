-- 20260911124500_fin_financiamento_competencia_01.sql
-- FIN-FINANCIAMENTO-COMPETENCIA-01: parcelas de financiamento com competencia no vencimento.
-- 61 parcelas programadas do BRDE (NJ) tinham data_competencia em 21/11/2025 e vencimento
-- correto (2026-2040): a safra 25/26 e o mes de nov/25 carregavam a divida inteira de 15 anos.
-- Corrige competencia = vencimento. So parcelas programadas de juros/amortizacao de
-- financiamento com vencimento preenchido. Auditoria/editado_manual desligados na transacao.
-- APLICADA no proto em 2026-09-11 via Management API, apos teste em ROLLBACK.
alter table financeiro_lancamentos_v2 disable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 disable trigger trg_financeiro_lancamento_v2_editado_manual;
update financeiro_lancamentos_v2 l set data_competencia = l.data_vencimento
  from financeiro_plano_contas p, financeiro_fornecedores f
 where p.id=l.plano_conta_id and f.id=l.favorecido_id
   and l.cliente_id='f2d67cd4-24d0-456f-a079-a3281dcce7fd' and f.nome ilike '%BRDE%'
   and l.status_transacao='programado'
   and p.subcentro in ('Juros de Financiamento Agricultura','Amortização Financiamento Agricultura')
   and l.data_vencimento is not null
   and l.data_competencia is distinct from l.data_vencimento;
alter table financeiro_lancamentos_v2 enable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 enable trigger trg_financeiro_lancamento_v2_editado_manual;
-- Esperado: 0 parcelas programadas do BRDE com competencia em 2025; distribuidas 2026-2040.
