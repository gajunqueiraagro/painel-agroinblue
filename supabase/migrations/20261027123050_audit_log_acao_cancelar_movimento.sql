-- O CHECK DE `conciliacao_audit_log.acao` PASSA A ACEITAR AS DUAS ACOES DO CANCELAMENTO.
--
-- ⚠ ELA VEM ANTES DAS DUAS RPCs (20261027123100 e 20261027123200) PORQUE ELAS DEPENDEM DELA.
-- Sem esta alteracao, o `INSERT INTO conciliacao_audit_log` das duas funcoes viola o CHECK e a
-- transacao inteira aborta: o operador clicaria em "marcar como duplicado", nada seria gravado, e
-- a mensagem que a tela mostraria seria um erro de constraint — sobre uma tabela que ele nao sabe
-- que existe.
--
-- O ESTADO ANTES: o CHECK listava 15 acoes, e NENHUMA das duas novas estava nela —
--   conciliacao_criada, conciliacao_desfeita, conciliacao_substituida, extrato_marcado_orfao,
--   extrato_desmarcado_orfao, lancamento_marcado_orfao, lancamento_desmarcado_orfao,
--   importacao_revertida, mes_reaberto, mes_fechado, warning_mes_fechado,
--   warning_delete_extrato, extrato_ignorado, derivado_promovido_independente,
--   derivado_cancelado_com_origem.
-- Depois sao 17: entram `movimento_cancelado` e `movimento_cancelamento_revertido`.
--
-- ⚠ NENHUM GATE DO REPO PEGA ISTO, e vale registrar por que: `tsc`, `build`, `check:tdz` e
-- `check:ui-nativo` olham o front, e um CHECK violado so aparece em RUNTIME, na primeira vez que
-- alguem clica. O que pegou foi a leitura do schema antes de aplicar — conferir o dominio da
-- coluna que se vai escrever e parte de escrever a RPC, nao zelo extra.
--
-- ⚠ DROP + ADD, E NAO `ALTER CONSTRAINT`: um CHECK nao se altera no lugar em Postgres. O DROP
-- deixa a tabela sem a trava por um instante DENTRO da transacao da migration — nenhuma linha
-- passa nesse intervalo, porque a transacao e atomica.
--
-- Aplicada no proto pelo arquiteto em 18/09/2026; esta migration e REGISTRO HISTORICO.
-- Conferida contra o banco por `pg_get_constraintdef`:
--   md5 d5b8e473ad25d025f9fd48b74c9038ef  (17 acoes, na ordem abaixo)

ALTER TABLE public.conciliacao_audit_log DROP CONSTRAINT conciliacao_audit_log_acao_check;

ALTER TABLE public.conciliacao_audit_log ADD CONSTRAINT conciliacao_audit_log_acao_check
CHECK (acao = ANY (ARRAY['conciliacao_criada','conciliacao_desfeita','conciliacao_substituida',
'extrato_marcado_orfao','extrato_desmarcado_orfao','lancamento_marcado_orfao',
'lancamento_desmarcado_orfao','importacao_revertida','mes_reaberto','mes_fechado',
'warning_mes_fechado','warning_delete_extrato','extrato_ignorado',
'derivado_promovido_independente','derivado_cancelado_com_origem',
'movimento_cancelado','movimento_cancelamento_revertido']::text[]));
