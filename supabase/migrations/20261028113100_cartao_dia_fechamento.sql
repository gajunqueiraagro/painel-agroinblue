-- CARTAO-LANCAMENTO-01 (Gabriel 30/10/2026, decisão 3) — o DIA DE FECHAMENTO da fatura no cadastro do cartão.
-- Opcional (nulo = a regra de hoje: o dia da fatura no mês seguinte à competência). Só o cartão o usa; a tela só o mostra para
-- `tipo_conta = 'cartao'`. A compra no cartão vence na fatura onde ela cai pelo fechamento (regra pura no front, testada).
-- Ensaio no proto (30/10, RAISE no fim): 70 contas, todas nulas depois; o 32 é recusado pelo CHECK.
SET LOCAL lock_timeout = '2s';

ALTER TABLE public.financeiro_contas_bancarias ADD COLUMN dia_fechamento smallint NULL
  CONSTRAINT chk_conta_dia_fechamento CHECK (dia_fechamento BETWEEN 1 AND 31);

COMMENT ON COLUMN public.financeiro_contas_bancarias.dia_fechamento IS
  'CARTAO-LANCAMENTO-01: dia de fechamento da fatura do cartão (opcional; nulo = vence no dia da fatura do mês seguinte à competência)';
