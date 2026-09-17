-- NJ PECUARIA — as transferencias internas ganham favorecido, aplicado no proto em 17/09/2026.
--
-- As transferencias entre contas do proprio NJ estavam sem `favorecido_id`: na lista, na
-- exportacao e no PDF elas apareciam com "—" na coluna de quem recebeu, e "—" significa dado
-- ausente. Nao era ausencia: o dinheiro foi de um bolso para outro do MESMO titular, e o
-- favorecido e ele proprio. Foram 818 linhas vivas carimbadas com Natalino Cavalli Junior.
--
-- ⚠ E CARIMBO DE EXIBICAO, NAO DE CAIXA: nada de valor, conta, data ou conciliacao muda aqui.
-- ⚠ IDEMPOTENTE: a guarda e `favorecido_id IS NULL`. Depois da aplicacao restaram 0 transferencias
-- do NJ sem favorecido (838 no total: 819 com Natalino, 19 com outro favorecido ja escolhido a
-- mao, que este UPDATE nao toca).
-- ⚠ O FORNECEDOR E DO PROPRIO CLIENTE (conferido: `financeiro_fornecedores.cliente_id` = NJ
-- Pecuaria), entao o filtro por `cliente_id` no UPDATE nao e redundante — ele impede que um id de
-- fornecedor de um cliente vaze para a linha de outro.

UPDATE public.financeiro_lancamentos_v2 l
   SET favorecido_id = 'd4be8b12-a9c7-4440-8ea4-3f5c8341641a'
  FROM public.financeiro_fornecedores f
 WHERE f.id = 'd4be8b12-a9c7-4440-8ea4-3f5c8341641a'
   AND l.cliente_id = f.cliente_id
   AND l.tipo_operacao LIKE '3-%'
   AND l.favorecido_id IS NULL
   AND l.cancelado = false;
