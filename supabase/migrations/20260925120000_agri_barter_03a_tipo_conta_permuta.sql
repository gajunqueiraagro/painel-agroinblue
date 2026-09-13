-- 20260925120000_agri_barter_03a_tipo_conta_permuta.sql
-- AGRI-BARTER-03A: a conta de permuta ganha tipo próprio.
--
-- ⚠ ESTE ARQUIVO VERSIONA O QUE JA' ESTA' VIVO NO PROTO. O CHECK foi trocado pelo Chat via
--   Management API sob GO; nao se reaplica por ele. Conferido em `pg_get_constraintdef`,
--   13/09/2026: o check aceita `cc`, `inv`, `cartao` e `permuta`, e continua admitindo NULO.
--
-- O MOTIVO E' DE CONTABILIDADE, nao de cadastro: a conta de permuta (uma por parceiro, ex.
-- "Permuta · Casul") NAO PODE se misturar com o caixa de banco real. O barter move valor sem
-- mover dinheiro — se a conta dele entrasse como `cc`, o saldo do produtor apareceria inflado
-- pelo que ele deve e pelo que tem a receber em grão, e o extrato bancário deixaria de bater
-- com o banco de verdade. Tipo próprio é o que mantém as duas contas separadas na origem.
--
-- COMO OS LANÇAMENTOS DE BARTER A USAM: `sem_movimentacao_caixa = true` + esta conta. Ela tem
-- extrato próprio — o deve e o tem com a cooperativa.
--
-- ⚠ O CHECK ABRE O VALOR; O FRONT AINDA NAO O CONHECE. Medido em 13/09/2026: existem 69 contas
--   (35 `cc`, 25 `inv`, 9 `cartao`) e NENHUMA de permuta — então nada mudou de comportamento
--   hoje. Mas quando a primeira for criada, os seletores e as somas que hoje tratam toda conta
--   como conta de banco vão incluí-la: `MesaClassificacaoTab`, `MesaEnriquecimentoTab`,
--   `catalogoCliente`, `V2MesaOperacional` e os painéis de saldo leem `tipo_conta` sem prever
--   este valor. Ensiná-los a separar a permuta do caixa é a peça seguinte da camada 3 — não
--   está aqui, e por isso fica escrito: criar a conta antes disso infla o caixa na tela.

alter table public.financeiro_contas_bancarias drop constraint financeiro_contas_bancarias_tipo_conta_check;
alter table public.financeiro_contas_bancarias add constraint financeiro_contas_bancarias_tipo_conta_check
  check (tipo_conta is null or tipo_conta = any (array['cc','inv','cartao','permuta']));
