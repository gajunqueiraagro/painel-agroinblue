-- NJ PECUARIA — as transferencias internas ganham favorecido, aplicado no proto em 17/09/2026.
--
-- As transferencias entre contas do proprio NJ estavam com favorecido ERRADO, nao vazio: a
-- importacao atribuiu o fornecedor pelo texto do extrato, e sobraram 598 linhas com "Piscina Cia"
-- mais 78 com nome de BANCO (Sicredi, Banco do Brasil, Cooperativa...). Banco nao e favorecido: e
-- o trilho por onde o dinheiro andou. E numa transferencia entre contas do PROPRIO produtor o
-- favorecido e ele mesmo — o dinheiro foi de um bolso para outro do mesmo titular. Foram 818
-- linhas vivas carimbadas com Natalino Cavalli Junior.
--
-- ⚠ E CARIMBO DE EXIBICAO, NAO DE CAIXA: nada de valor, conta, data ou conciliacao muda aqui.
-- ⚠ A GUARDA E `IS DISTINCT FROM`, NAO `IS NULL`, e a diferenca importa: `IS NULL` so preencheria
-- o vazio e deixaria as 598 "Piscina Cia" como estavam. `IS DISTINCT FROM` SOBRESCREVE o
-- fornecedor errado — que e o que de fato rodou no proto em 17/09/2026, e o que este arquivo
-- precisa reproduzir num banco limpo. (A primeira versao desta migration, commit 36e924c2, foi
-- versionada com `IS NULL` por engano: o repo nao reproduzia o banco. Corrigido em
-- PR-FIN-TRANSF-NJ-GUARDA-02.)
-- ⚠ E `cancelado = false` FICA: as 20 transferencias canceladas do NJ nao foram tocadas, e 19
-- delas seguem com o fornecedor antigo (14 "Piscina Cia", 2 "Caixa Carlos Pacheco", 1 Sicredi,
-- 1 Cooperativa, 1 Banco do Brasil). Cancelado e historia e nao se reescreve — e conferido em
-- 17/09: entre as VIVAS nao ha nenhuma com outro favorecido, entao nao ha escolha manual a
-- preservar aqui.
-- ⚠ IDEMPOTENTE: depois da aplicacao, as 818 vivas ja tem exatamente este favorecido, entao a
-- guarda nao alcanca nenhuma. Conferido em BEGIN/ROLLBACK sobre o proto: 0 linhas.
-- ⚠ O FORNECEDOR E DO PROPRIO CLIENTE (conferido: `financeiro_fornecedores.cliente_id` = NJ
-- Pecuaria), entao o filtro por `cliente_id` no UPDATE nao e redundante — ele impede que um id de
-- fornecedor de um cliente vaze para a linha de outro.

UPDATE public.financeiro_lancamentos_v2 l
   SET favorecido_id = 'd4be8b12-a9c7-4440-8ea4-3f5c8341641a'
  FROM public.financeiro_fornecedores f
 WHERE f.id = 'd4be8b12-a9c7-4440-8ea4-3f5c8341641a'
   AND l.cliente_id = f.cliente_id
   AND l.tipo_operacao LIKE '3-%'
   AND l.favorecido_id IS DISTINCT FROM 'd4be8b12-a9c7-4440-8ea4-3f5c8341641a'::uuid
   AND l.cancelado = false;
