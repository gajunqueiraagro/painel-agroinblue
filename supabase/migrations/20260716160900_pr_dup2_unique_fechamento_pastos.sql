-- PR-DUP-2 — Constraint de unicidade dos cards mensais de fechamento_pastos.
-- Garante no maximo 1 card por (fazenda_id, pasto_id, ano_mes). Pre-requisito da RPC
--   idempotente DUP-3. NAO valida a correspondencia fechamento_pastos.fazenda_id x pastos.fazenda_id
--   (isso e DUP-GERAL, divida separada). Pre-requisito de dado: DUP-1B (duplicidades = 0).
--
-- Risco de lock: ADD CONSTRAINT exige ACCESS EXCLUSIVE. Para ~19.898 linhas / ~9 MB espera-se
--   duracao curta, mas o tempo sera medido no Proto. Aplicar fora de atividade operacional intensa.
--   lock_timeout/statement_timeout evitam bloquear a operacao se o lock nao vier rapido.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  v_dup integer;
  v_constraint_exists boolean;
  v_index_exists boolean;
  v_equivalent_unique integer;
BEGIN
  -- Gate 1: zero duplicidades (senao a criacao falharia; exigir DUP-1 antes).
  SELECT count(*) INTO v_dup
  FROM (SELECT 1 FROM public.fechamento_pastos GROUP BY fazenda_id, pasto_id, ano_mes HAVING count(*) > 1) AS d;
  IF v_dup <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = format('dup2_gate_falhou: %s chaves duplicadas; executar DUP-1 antes', v_dup);
  END IF;

  -- Gate 2: nome pretendido de constraint/indice ainda nao existe.
  SELECT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.fechamento_pastos'::regclass
                    AND conname = 'fechamento_pastos_fazenda_pasto_ano_mes_key') INTO v_constraint_exists;
  SELECT EXISTS (SELECT 1 FROM pg_class i JOIN pg_namespace n ON n.oid = i.relnamespace
                  WHERE n.nspname = 'public'
                    AND i.relname = 'fechamento_pastos_fazenda_pasto_ano_mes_key'
                    AND i.relkind = 'i') INTO v_index_exists;
  IF v_constraint_exists OR v_index_exists THEN
    RAISE EXCEPTION USING ERRCODE = '42P07',
      MESSAGE = 'dup2_gate_falhou: nome de constraint/indice ja existe';
  END IF;

  -- Gate 3: nenhuma UNIQUE equivalente (constraint OU indice unico) cobrindo exatamente
  --   {fazenda_id, pasto_id, ano_mes}. Estrutura lida por CONKEY/INDKEY via unnest WITH
  --   ORDINALITY (mesma estrategia do teste T3), nao por nome. Comparacao por CONJUNTO
  --   (ordem-independente): para UNIQUE, a ordem das colunas nao altera a unicidade, logo
  --   qualquer permutacao das 3 colunas ja torna esta constraint redundante.
  SELECT
    (SELECT count(*) FROM (
       SELECT c.oid, array_agg(a.attname::text ORDER BY a.attname::text) AS set_cols
         FROM pg_constraint c
         CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        WHERE c.conrelid = 'public.fechamento_pastos'::regclass AND c.contype = 'u'
        GROUP BY c.oid) uc
       WHERE uc.set_cols = ARRAY['ano_mes','fazenda_id','pasto_id'])
    +
    (SELECT count(*) FROM (
       SELECT ix.indexrelid, array_agg(a.attname::text ORDER BY a.attname::text) AS set_cols
         FROM pg_index ix
         CROSS JOIN LATERAL unnest(ix.indkey::int[]) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
        WHERE ix.indrelid = 'public.fechamento_pastos'::regclass AND ix.indisunique
        GROUP BY ix.indexrelid) ui
       WHERE ui.set_cols = ARRAY['ano_mes','fazenda_id','pasto_id'])
  INTO v_equivalent_unique;
  IF v_equivalent_unique > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '42P07',
      MESSAGE = 'dup2_gate_falhou: ja existe UNIQUE equivalente cobrindo (fazenda_id, pasto_id, ano_mes)';
  END IF;
END $$;

ALTER TABLE public.fechamento_pastos
  ADD CONSTRAINT fechamento_pastos_fazenda_pasto_ano_mes_key
  UNIQUE (fazenda_id, pasto_id, ano_mes);

COMMENT ON CONSTRAINT fechamento_pastos_fazenda_pasto_ano_mes_key ON public.fechamento_pastos IS
  'DUP-2: garante no maximo um card por fazenda, pasto e competencia. Pre-requisito da RPC idempotente DUP-3. Nao valida a correspondencia entre fechamento_pastos.fazenda_id e pastos.fazenda_id.';
