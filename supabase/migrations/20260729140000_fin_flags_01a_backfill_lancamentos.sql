-- FIN-FLAGS-01A — Fase 3: BACKFILL de financeiro_lancamentos_v2.compoe_dre (legado).
--   Aplica a matriz soberana ao legado. Idempotente. Precedência (igual ao trigger):
--     (A) transferência tipo 3-* ⇒ false (SOBERANA — cobre NULL e corrige não-nulos incompatíveis);
--     (B) macros da matriz sobre linhas NULL (macro é a fonte no legado; herança de plano NÃO usada —
--         não há linha legada com macro fora da matriz E plano determinístico: os 6 residuais têm
--         macro/subcentro/plano todos ausentes, logo permanecem NULL sob ambas as regras);
--     (C) demais permanecem NULL (residual sem regra determinística).
--
--   SUPRESSÃO DE TRIGGERS — mecanismo autocontido e comprovável (bloco DO):
--     • Entra em `replica` via `SET LOCAL session_replication_role = replica`. LOCAL = escopo da
--       transação do bloco; reverte SOZINHO ao fim (mesmo sem transação explícita do executor, o
--       bloco DO é uma única statement/transação). Comprovado: sob replica o audit NÃO dispara.
--       (Obs.: usa-se a forma statement SET LOCAL — set_config() é negado para este parâmetro.)
--     • Retorna a `origin` EXPLICITAMENTE antes das assertions.
--     • Retorna a `origin` também no bloco EXCEPTION e re-propaga o erro (aborta a migration).
--     • Triggers suprimidos: todos os de USUÁRIO da tabela durante os 3 UPDATE — inclui audit
--       (evita ~68k "editou"), updated_at/editado_manual (nenhum outro campo alterado), guards e o
--       próprio zzz (desnecessário: valores são explícitos). NENHUMA integridade relevante se perde:
--       o UPDATE altera só compoe_dre; não há FK/ível de negócio dependente dessa coluna; cancelados
--       não são reativados; hash não muda (não depende de compoe_dre).
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em produção.
DO $backfill$
DECLARE
  v_leak int;
BEGIN
  SET LOCAL session_replication_role = replica;   -- LOCAL: reverte ao fim da transação; suprime triggers de usuário

  -- (A) Transferência soberana: cobre NULL e corrige não-nulos incompatíveis (ex.: transfers = true).
  UPDATE public.financeiro_lancamentos_v2 SET compoe_dre = false
   WHERE tipo_operacao ILIKE '3-%' AND compoe_dre IS DISTINCT FROM false;

  -- (B) Macros FALSE — somente NULL. Após (A) nenhuma transferência permanece NULL.
  UPDATE public.financeiro_lancamentos_v2 SET compoe_dre = false
   WHERE compoe_dre IS NULL
     AND macro_custo IN ('Transferências','Entre Contas','Dividendos','Entrada Financeira','Saída Financeira','Financeiro');

  -- (B) Macros TRUE — somente NULL.
  UPDATE public.financeiro_lancamentos_v2 SET compoe_dre = true
   WHERE compoe_dre IS NULL
     AND macro_custo IN ('Receita Operacional','Custeio Produção','Deduções de Receitas','Investimento na Fazenda','Investimento em Bovinos','Tributos');

  -- (C) Demais (sem macro/subcentro determinístico e não-transferência) permanecem NULL.

  SET LOCAL session_replication_role = origin;    -- restauração explícita antes das assertions

  -- ── Assertions pós-backfill: qualquer vazamento aborta e reverte a migration ──
  SELECT count(*) INTO v_leak FROM public.financeiro_lancamentos_v2
   WHERE compoe_dre IS TRUE AND tipo_operacao ILIKE '3-%';
  IF v_leak <> 0 THEN RAISE EXCEPTION 'backfill FALHOU: % transferência(s) com compoe_dre=true', v_leak; END IF;

  SELECT count(*) INTO v_leak FROM public.financeiro_lancamentos_v2
   WHERE compoe_dre IS TRUE AND tipo_operacao NOT ILIKE '3-%'
     AND macro_custo IN ('Transferências','Entre Contas','Dividendos','Entrada Financeira','Saída Financeira','Financeiro');
  IF v_leak <> 0 THEN RAISE EXCEPTION 'backfill FALHOU: % macro-FALSE com compoe_dre=true', v_leak; END IF;

  SELECT count(*) INTO v_leak FROM public.financeiro_lancamentos_v2
   WHERE compoe_dre IS FALSE AND tipo_operacao NOT ILIKE '3-%'
     AND macro_custo IN ('Receita Operacional','Custeio Produção','Deduções de Receitas','Investimento na Fazenda','Investimento em Bovinos','Tributos');
  IF v_leak <> 0 THEN RAISE EXCEPTION 'backfill FALHOU: % macro-TRUE com compoe_dre=false', v_leak; END IF;

  -- Toda transferência e toda macro DA MATRIZ têm de estar classificadas (não podem restar NULL).
  -- Linhas com macro fora da matriz (ex.: legadas 'Receita'/'Deduções'/'Receita Pecuária', hoje só
  -- em cancelados) ou sem macro permanecem NULL LEGITIMAMENTE — não são vazamento.
  SELECT count(*) INTO v_leak FROM public.financeiro_lancamentos_v2
   WHERE compoe_dre IS NULL AND (tipo_operacao ILIKE '3-%'
     OR macro_custo IN ('Transferências','Entre Contas','Dividendos','Entrada Financeira','Saída Financeira','Financeiro','Receita Operacional','Custeio Produção','Deduções de Receitas','Investimento na Fazenda','Investimento em Bovinos','Tributos'));
  IF v_leak <> 0 THEN RAISE EXCEPTION 'backfill FALHOU: % transferência/macro-da-matriz permaneceram NULL', v_leak; END IF;

EXCEPTION WHEN OTHERS THEN
  SET LOCAL session_replication_role = origin;    -- restauração garantida em erro
  RAISE;                                          -- re-propaga: aborta a migration
END
$backfill$;
