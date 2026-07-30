-- PR-FIN-STATUS-UX-03A-2B — BACKFILL do legado financeiro_lancamentos_v2.status_transacao='meta' -> 'previsto'.
--
--   DECISÃO DE PRODUTO RATIFICADA: no Financeiro V2, status_transacao='meta' é vocabulário LEGADO
--   equivalente a 'previsto'. Esta migration elimina o valor 'meta' migrando-o EXCLUSIVAMENTE para
--   'previsto', em TODA a tabela (ativos E cancelados), SEM distribuir entre agendado/programado/realizado.
--   'realizado' está VETADO como destino. O predicado é único: status_transacao='meta'.
--
--   EIXO ÚNICO (status_transacao). NÃO toca o eixo de PLANEJAMENTO cenario='meta' (conceito distinto e
--   legítimo). Comprovado READ-ONLY no Proto que os eixos são DISJUNTOS: 0 linha tem
--   status_transacao='meta' E cenario='meta'; as linhas cenario='meta' têm status_transacao <> 'meta',
--   logo NÃO são alcançadas pelo predicado WHERE status_transacao='meta'. Nenhuma linha de Planejamento
--   é alterada. Toda referência a 'meta' abaixo indica status_transacao, EXCETO as leituras rotuladas
--   como invariante de Planejamento (contam cenario='meta' apenas para PROVAR que NÃO mudou — nunca escrito).
--
--   PRÉ-CONDIÇÃO: o último writer ativo de status_transacao='meta' (Modo Rápido) foi eliminado no commit
--   581418b3 — faucet fechado; nenhum novo 'meta' surge após o backfill.
--
--   COMPORTAMENTO NORMAL DA TABELA: o UPDATE roda com o comportamento padrão da tabela. Os triggers de
--   usuário disparam normalmente (auditoria, updated_at, editado_manual em linhas importadas, resolução
--   de classificação/DRE a partir do plano) — efeitos normais e esperados de um UPDATE, não mascarados.
--   Nenhum bypass de integridade referencial. Guards auditados não bloqueiam: guard_financeiro_lancamento_v2
--   só aborta origem='importacao_historica' (0 linhas meta) e guard_transferencia_conta_destino só aborta
--   remoção de conta_destino (não tocada pelo backfill).
--
--   TRANSACIONAL, FAIL-FAST e IDEMPOTENTE: seguro onde não há mais 'meta' (0 linhas -> no-op verificado,
--   não falha por contagem zero). Aborta e REVERTE (RAISE EXCEPTION dentro do bloco) se: tabela/coluna
--   ausentes; coluna não-textual; restar 'meta'; ROW_COUNT divergir da população pré-UPDATE; qualquer
--   outro balde de status mudar; ou cenario='meta' for alterado.
--
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em produção.
DO $backfill_meta_previsto$
DECLARE
  v_col_type            text;
  v_meta_before         int;
  v_previsto_before     int;
  v_agendado_before     int;
  v_programado_before   int;
  v_realizado_before    int;
  v_conciliado_before   int;
  v_cenario_meta_before int;   -- invariante de PLANEJAMENTO (read-only)
  v_updated             int;
  v_after               int;
BEGIN
  -- ── Pré-checks estruturais ──
  IF to_regclass('public.financeiro_lancamentos_v2') IS NULL THEN
    RAISE EXCEPTION 'backfill ABORTADO: tabela public.financeiro_lancamentos_v2 inexistente';
  END IF;

  SELECT data_type INTO v_col_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name  = 'financeiro_lancamentos_v2'
     AND column_name = 'status_transacao';
  IF v_col_type IS NULL THEN
    RAISE EXCEPTION 'backfill ABORTADO: coluna status_transacao inexistente';
  END IF;
  IF v_col_type <> 'text' THEN
    RAISE EXCEPTION 'backfill ABORTADO: status_transacao nao e text (e %) — destino ''previsto'' pode ser invalido', v_col_type;
  END IF;

  -- ── Snapshot ANTES (baseline das assertions) ──
  SELECT
      count(*) FILTER (WHERE status_transacao = 'meta'),
      count(*) FILTER (WHERE status_transacao = 'previsto'),
      count(*) FILTER (WHERE status_transacao = 'agendado'),
      count(*) FILTER (WHERE status_transacao = 'programado'),
      count(*) FILTER (WHERE status_transacao = 'realizado'),
      count(*) FILTER (WHERE status_transacao = 'conciliado'),
      count(*) FILTER (WHERE cenario = 'meta')            -- read-only: invariante de PLANEJAMENTO
    INTO v_meta_before, v_previsto_before, v_agendado_before, v_programado_before,
         v_realizado_before, v_conciliado_before, v_cenario_meta_before
    FROM public.financeiro_lancamentos_v2;

  -- ── Backfill: eixo status_transacao; ativos E cancelados; SEM outros filtros; triggers normais ──
  UPDATE public.financeiro_lancamentos_v2
     SET status_transacao = 'previsto'
   WHERE status_transacao = 'meta';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- ── Assertions pos-backfill (qualquer divergencia aborta e reverte a migration) ──

  -- (1) ROW_COUNT == populacao 'meta' encontrada imediatamente antes.
  IF v_updated <> v_meta_before THEN
    RAISE EXCEPTION 'backfill FALHOU: ROW_COUNT % <> populacao meta pre-UPDATE %', v_updated, v_meta_before;
  END IF;

  -- (2) Nenhum 'meta' remanescente.
  SELECT count(*) INTO v_after FROM public.financeiro_lancamentos_v2 WHERE status_transacao = 'meta';
  IF v_after <> 0 THEN
    RAISE EXCEPTION 'backfill FALHOU: restaram % registros com status_transacao=''meta''', v_after;
  END IF;

  -- (3) 'previsto' recebeu EXATAMENTE a populacao migrada (nada alem de meta virou previsto).
  SELECT count(*) INTO v_after FROM public.financeiro_lancamentos_v2 WHERE status_transacao = 'previsto';
  IF v_after <> v_previsto_before + v_meta_before THEN
    RAISE EXCEPTION 'backfill FALHOU: previsto pos % <> previsto antes % + meta %', v_after, v_previsto_before, v_meta_before;
  END IF;

  -- (4) Nenhum registro convertido para agendado/programado/realizado/conciliado (baldes intactos).
  SELECT count(*) INTO v_after FROM public.financeiro_lancamentos_v2 WHERE status_transacao = 'agendado';
  IF v_after <> v_agendado_before THEN RAISE EXCEPTION 'backfill FALHOU: agendado mudou (% -> %)', v_agendado_before, v_after; END IF;
  SELECT count(*) INTO v_after FROM public.financeiro_lancamentos_v2 WHERE status_transacao = 'programado';
  IF v_after <> v_programado_before THEN RAISE EXCEPTION 'backfill FALHOU: programado mudou (% -> %)', v_programado_before, v_after; END IF;
  SELECT count(*) INTO v_after FROM public.financeiro_lancamentos_v2 WHERE status_transacao = 'realizado';
  IF v_after <> v_realizado_before THEN RAISE EXCEPTION 'backfill FALHOU: realizado mudou (% -> %)', v_realizado_before, v_after; END IF;
  SELECT count(*) INTO v_after FROM public.financeiro_lancamentos_v2 WHERE status_transacao = 'conciliado';
  IF v_after <> v_conciliado_before THEN RAISE EXCEPTION 'backfill FALHOU: conciliado mudou (% -> %)', v_conciliado_before, v_after; END IF;

  -- (5) Eixo de PLANEJAMENTO intocado: cenario='meta' identico (read-only; nunca escrito nesta migration).
  SELECT count(*) INTO v_after FROM public.financeiro_lancamentos_v2 WHERE cenario = 'meta';
  IF v_after <> v_cenario_meta_before THEN
    RAISE EXCEPTION 'backfill FALHOU: cenario=''meta'' alterado (% -> %) — Planejamento NAO pode ser tocado', v_cenario_meta_before, v_after;
  END IF;

  RAISE NOTICE 'PR-FIN-STATUS-UX-03A-2B: % registro(s) status_transacao meta->previsto; cenario=meta intocado (% linhas).', v_updated, v_cenario_meta_before;
END
$backfill_meta_previsto$;
