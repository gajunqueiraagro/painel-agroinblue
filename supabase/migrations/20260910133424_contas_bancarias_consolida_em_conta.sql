ALTER TABLE public.financeiro_contas_bancarias
  ADD COLUMN IF NOT EXISTS consolida_em_conta_id uuid NULL REFERENCES public.financeiro_contas_bancarias(id);
COMMENT ON COLUMN public.financeiro_contas_bancarias.consolida_em_conta_id IS 'Conta interna: o banco consolida o saldo desta conta na conta apontada e nao exporta as transferencias entre elas no extrato (ex.: Invest Facil -> conta corrente Bradesco). Conciliacao: transferencias com esta conta ficam fora do sem par e do fechamento por dia; o saldo do extrato da conta-mae = saldo dela + saldo das internas.';
UPDATE public.financeiro_contas_bancarias SET consolida_em_conta_id='186a093b-0204-4164-95e3-0dd247457ffa'
 WHERE id='c2ce6a0e-7785-463d-9a1a-b4f66e9ee147' AND cliente_id='a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
