-- CARTAO-LANCAMENTO-01 (Gabriel 30/10/2026 18:28, "ok. digitado") — o DIA DE VENCIMENTO da fatura, DIGITADO no cadastro do cartão.
-- Opcional: vazio = o dia mais frequente das faturas do cartão (`fn_cartao_dias_de_vencimento`, 12 meses); sem nenhum dos dois, o
-- lançamento não sugere vencimento. Junto com o `dia_fechamento` (20261028113100), a compra vence na fatura onde ela cai.
-- Ensaio no proto (30/10, RAISE no fim): 70 contas, todas nulas depois; o 0 é recusado pelo CHECK.
SET LOCAL lock_timeout = '2s';

ALTER TABLE public.financeiro_contas_bancarias ADD COLUMN dia_vencimento smallint NULL
  CONSTRAINT chk_conta_dia_vencimento CHECK (dia_vencimento BETWEEN 1 AND 31);

COMMENT ON COLUMN public.financeiro_contas_bancarias.dia_vencimento IS
  'CARTAO-LANCAMENTO-01: dia de vencimento da fatura do cartão, digitado (opcional; nulo = o dia mais frequente das faturas)';
