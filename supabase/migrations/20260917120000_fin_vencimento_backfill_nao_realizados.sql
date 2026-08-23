-- PR-FIN-VENCIMENTO-BACKFILL-02 — PR 2: os 633 nao-realizados.
--
-- Data prevista movida para o campo certo: em previsto/programado/
-- agendado o lancamento NAO foi pago, e `data_pagamento` preenchida faz
-- todo codigo que testa `IS NOT NULL` trata-lo como pago. Mover restaura
-- o significado dos dois campos. Decisao de Gabriel, 23/08.
--
-- Ao contrario do PR 1, aqui `data_pagamento` e APAGADA. Por isso o backup
-- guarda a data, nao so o id: sem ela o rollback nao restaura nada.
--
-- ESCOPO: `cancelado = false`, os tres status nao-realizados. Os 5 previstos
-- sem nenhuma das duas datas ficam como estao — nao ha de onde inferir, e o
-- WHERE exige `data_pagamento IS NOT NULL`, entao eles nao sao tocados.
--
-- TRIGGERS DESABILITADOS — tres, nominalmente.
--   audit_financeiro_v2  mesmo motivo do PR 1 (aqui sao so 633 linhas, mas a
--                        migration versionada continua sendo o registro).
--   editado_manual e unique_hash: marcariam 162 linhas como editadas a mao e
--   87-115 como duplicadas — as duas marcas seriam FALSAS, criadas pela
--   propria migration. A duplicidade em especial nasceria de zerar a data,
--   nao de haver duplicata: o trigger compara campo a campo e, sem
--   data_pagamento, linhas que hoje se distinguem por ela passam a colidir.
--   Medido em 23/08.
--
-- TRIGGERS MANTIDOS LIGADOS, de proposito:
--   hash        recalcular e o comportamento CORRETO — o hash descreve a
--               linha, e a linha mudou. Desliga-lo deixaria 162 hashes
--               descrevendo um estado que nao existe mais. Conferido que ele
--               e INDEPENDENTE do unique_hash: sao BEFORE ROW, disparam em
--               ordem alfabetica (hash antes de unique_hash), o unique_hash
--               nao le `NEW.hash_importacao` — classifica por comparacao
--               campo a campo — e nenhum trigger que roda antes do hash
--               escreve qualquer um dos 11 campos que ele le. Desligar um
--               nao altera o resultado do outro.
--   oc_sync_liquidacao_financeiro  e no-op nas 633: `v_liquidado` depende de
--               `status_transacao IN ('realizado','conciliado')`, nao de
--               data_pagamento, entao ja e false hoje; zero das 633 tem parte
--               ativa em zoo_operacao_partes; o UPDATE de estorno atinge 0
--               linhas; e os dois RAISE EXCEPTION estao no ramo inalcancavel.
--   guard_update, guard_transferencia_destino, zzz_dre_lcdpr, updated_at:
--               inertes ou corretos, medidos no PR 1.

BEGIN;

-- 1. Backup COM a data: ela e apagada pela UPDATE.
CREATE TABLE public._bkp_venc_b_20260823 AS
SELECT id, data_pagamento
  FROM public.financeiro_lancamentos_v2
 WHERE cancelado = false
   AND status_transacao IN ('previsto', 'programado', 'agendado')
   AND data_vencimento IS NULL
   AND data_pagamento IS NOT NULL;

-- 2. Desliga os tres.
ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_audit_financeiro_v2;
ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_financeiro_lancamento_v2_editado_manual;
ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_financeiro_lancamento_v2_unique_hash;

-- 3. A mudanca de campo.
UPDATE public.financeiro_lancamentos_v2
   SET data_vencimento = data_pagamento,
       data_pagamento  = NULL
 WHERE cancelado = false
   AND status_transacao IN ('previsto', 'programado', 'agendado')
   AND data_vencimento IS NULL
   AND data_pagamento IS NOT NULL;

-- 4. Religa os tres. Dentro da transacao, de proposito: se a UPDATE falhar,
--    o ROLLBACK desfaz tambem os DISABLE.
ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_audit_financeiro_v2;
ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_financeiro_lancamento_v2_editado_manual;
ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_financeiro_lancamento_v2_unique_hash;

COMMENT ON TABLE public._bkp_venc_b_20260823 IS
  'Ids e data_pagamento ORIGINAL dos 633 nao-realizados cuja data prevista foi movida para
   data_vencimento (PR-FIN-VENCIMENTO-BACKFILL-02, 23/08/2026). Guarda a data porque a migration
   a APAGA — sem esta tabela o rollback nao teria de onde restaura-la.
   Descartar somente quando o backfill estiver homologado.';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (comentado)
--
-- Restaura os dois campos por id. Os mesmos tres triggers ficam desligados:
-- religar o editado_manual no rollback marcaria as 162 pela segunda vez.
--
-- BEGIN;
--
-- ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_audit_financeiro_v2;
-- ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_financeiro_lancamento_v2_editado_manual;
-- ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_financeiro_lancamento_v2_unique_hash;
--
-- UPDATE public.financeiro_lancamentos_v2 f
--    SET data_pagamento  = b.data_pagamento,
--        data_vencimento = NULL
--   FROM public._bkp_venc_b_20260823 b
--  WHERE f.id = b.id;
--
-- ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_audit_financeiro_v2;
-- ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_financeiro_lancamento_v2_editado_manual;
-- ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_financeiro_lancamento_v2_unique_hash;
--
-- DROP TABLE public._bkp_venc_b_20260823;
--
-- COMMIT;
