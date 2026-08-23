-- PR-FIN-VENCIMENTO-BACKFILL — PR 1: os 66.536 realizados.
--
-- Vencimento inferido do pagamento nos realizados: decisao de Gabriel em
-- 23/08 — campo em branco na tela parece defeito, e para o realizado o
-- vencimento nao decide nada (ja foi pago).
-- Consequencia registrada: depois disto, metrica de pontualidade
-- historica dara 100% nesses 66.536, porque vencimento e pagamento sao
-- iguais por construcao. Nao inferir atraso a partir deles.
--
-- `data_pagamento` PERMANECE. O lancamento foi pago; a data do pagamento e
-- fato, nao suposicao. Quem muda de campo e o NAO-realizado, e isso e o
-- PR 2, que segue bloqueado.
--
-- ESCOPO: `cancelado = false`. As 13.491 canceladas e as 574 de status
-- 'conciliado' (todas canceladas) ficam de fora por decisao de 23/08.
--
-- TRIGGERS. Dos 14 da tabela, apenas UM e desabilitado. Medido em 23/08
-- que os demais nao atrapalham esta UPDATE:
--   guard_update       zero linhas com origem_lancamento='importacao_historica'
--   editado_manual     `data_vencimento` nao esta nas 22 colunas da funcao
--   hash / unique_hash `data_vencimento` nao entra no hash; UPDATE OF nao casa
--   zzz_dre_lcdpr      v_reclass e false, nao escreve; 0 transferencias com
--                      compoe_dre <> false
--   updated_at         reescreve, e esta correto que reescreva
--
-- NAO copiar o precedente 20260410214818 verbatim: ele desabilita
-- `trg_guard_mes_fechado_lancamentos_v2`, que NAO EXISTE MAIS nesta tabela,
-- e a migration falharia. Ele tambem nao tem transacao — se a UPDATE
-- falhasse, os triggers ficariam desligados. Aqui o ENABLE esta DENTRO do
-- BEGIN/COMMIT, entao qualquer erro reverte tudo, inclusive o DISABLE.

BEGIN;

-- 1. Backup dos ids afetados. NAO e zelo excessivo: o rollback por WHERE
--    seria destrutivo. Medido em 23/08 que 1.147 dos 1.272 realizados que
--    JA tinham vencimento tem `data_vencimento = data_pagamento` hoje —
--    depois da UPDATE eles ficam indistinguiveis dos 66.536. Sem esta
--    tabela, o rollback apagaria vencimento legitimo de 1.147 linhas.
CREATE TABLE public._bkp_venc_20260823 AS
SELECT id
  FROM public.financeiro_lancamentos_v2
 WHERE cancelado = false
   AND status_transacao = 'realizado'
   AND data_vencimento IS NULL
   AND data_pagamento IS NOT NULL;

-- 2. audit_log desligado so nesta migration: seriam 66.536 linhas com duas
--    copias jsonb da linha inteira (~258 MB), levando a tabela de 78 MB para
--    ~340 MB — mais que a tabela de origem. Esta migration versionada e o
--    registro de auditoria da operacao.
ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_audit_financeiro_v2;

-- 3. O backfill.
UPDATE public.financeiro_lancamentos_v2
   SET data_vencimento = data_pagamento
 WHERE cancelado = false
   AND status_transacao = 'realizado'
   AND data_vencimento IS NULL
   AND data_pagamento IS NOT NULL;

-- 4. Religa. Dentro da transacao, de proposito.
ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_audit_financeiro_v2;

COMMENT ON TABLE public._bkp_venc_20260823 IS
  'Ids afetados pelo backfill de data_vencimento nos realizados (PR-FIN-VENCIMENTO-BACKFILL, 23/08/2026).
   Existe para tornar o rollback exato: apos a UPDATE, 1.147 linhas que ja tinham vencimento legitimo
   ficam indistinguiveis das 66.536 backfilladas, porque nelas vencimento e pagamento tambem coincidem.
   Descartar somente quando o backfill estiver homologado.';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (comentado)
--
-- Exato: desfaz SOMENTE os ids registrados no backup. Um rollback por
-- predicado (`WHERE data_vencimento = data_pagamento`) apagaria tambem as
-- 1.147 linhas que ja tinham vencimento igual ao pagamento ANTES desta
-- migration — por isso ele nao esta escrito aqui, nem como alternativa.
--
-- BEGIN;
--
-- ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_audit_financeiro_v2;
--
-- UPDATE public.financeiro_lancamentos_v2 f
--    SET data_vencimento = NULL
--   FROM public._bkp_venc_20260823 b
--  WHERE f.id = b.id;
--
-- ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_audit_financeiro_v2;
--
-- DROP TABLE public._bkp_venc_20260823;
--
-- COMMIT;
