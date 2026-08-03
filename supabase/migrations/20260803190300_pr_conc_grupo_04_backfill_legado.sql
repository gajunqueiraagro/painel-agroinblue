-- PR-CONC-GRUPO-FASE-1 — Migration 04: backfill dos grupos legados (SÓ 1×N LEGÍTIMO, só metadado).
-- Pré-requisito: revisar tests/pr_conc_grupo_04_conferencia_backfill.sql (mesma regra).
-- grupo_id = IDENTIDADE de uma decisão de conciliação (gen_random_uuid, NÃO derivada do extrato) —
-- UM uuid por grupo (por extrato), aplicado a todos os membros. Uma decisão futura sobre o mesmo
-- extrato gera nova identidade.
--
-- BACKFILL somente quando (regra aprovada):
--   (a) o extrato tem >= 2 vínculos ativos;
--   (b) NENHUM lançamento membro é compartilhado com outro extrato (exclui N:N/ponte);
--   (c) soma(valor_aplicado) = abs(valor do extrato) dentro de 0.005.
-- NÃO backfilla N×1 (extrato com 1 vínculo nunca é candidato) nem N:N (item (b)).
-- NÃO altera valor_aplicado, NÃO cria/desfaz vínculo. Idempotente (só toca grupo_id IS NULL).

DO $$
DECLARE v_rows int;
BEGIN
  WITH cand_ext AS (
    select extrato_id from conciliacao_bancaria_itens
    where desfeito_em is null group by extrato_id having count(*) >= 2
  ),
  legit AS (
    select e.extrato_id
    from cand_ext e
    where not exists (
          select 1 from conciliacao_bancaria_itens c
          where c.extrato_id = e.extrato_id and c.desfeito_em is null
            and exists (select 1 from conciliacao_bancaria_itens c2
                        where c2.lancamento_id = c.lancamento_id and c2.desfeito_em is null
                          and c2.extrato_id <> e.extrato_id))
      and (select count(*) from conciliacao_bancaria_itens c
           where c.extrato_id = e.extrato_id and c.desfeito_em is null) >= 2
      and abs( (select sum(valor_aplicado) from conciliacao_bancaria_itens c
                where c.extrato_id = e.extrato_id and c.desfeito_em is null)
               - abs((select valor from extrato_bancario_v2 x where x.id = e.extrato_id)) ) <= 0.005
  ),
  grupo_map AS (
    -- UM uuid por extrato-grupo (gen_random_uuid avaliado por linha de legit = por grupo).
    select extrato_id, gen_random_uuid() as grupo_id from legit
  )
  UPDATE conciliacao_bancaria_itens t
     SET grupo_id = m.grupo_id, tipo_aprovacao = 'agrupamento_legado'
    FROM grupo_map m
   WHERE t.extrato_id = m.extrato_id
     AND t.desfeito_em IS NULL
     AND t.grupo_id IS NULL;                               -- idempotência
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'PR-CONC-GRUPO backfill 1xN: % itens rotulados', v_rows;

  -- Trilha: uma entrada por grupo legado 1×N identificado (grupo_id = o que foi de fato gravado).
  INSERT INTO conciliacao_audit_log (acao, actor_user_id, cliente_id, extrato_id, motivo, payload_depois)
  SELECT 'grupo_legado_identificado', NULL, e.cliente_id, e.id, 'backfill_pr_conc_grupo_fase1_1xN',
         jsonb_build_object('grupo_id', c.grupo_id, 'itens', c.qtd, 'soma', c.soma, 'valor_ofx', abs(e.valor))
  FROM extrato_bancario_v2 e
  JOIN (
    select extrato_id, grupo_id, count(*) qtd, round(sum(valor_aplicado),2) soma
    from conciliacao_bancaria_itens
    where tipo_aprovacao = 'agrupamento_legado' and desfeito_em is null
    group by extrato_id, grupo_id
  ) c ON c.extrato_id = e.id
  WHERE NOT EXISTS (
    SELECT 1 FROM conciliacao_audit_log a
    WHERE a.acao = 'grupo_legado_identificado' AND a.extrato_id = e.id
  );
END $$;

-- ───────────────────────── ROLLBACK (metadado apenas; NUNCA desfaz vínculo) ─────────────────────────
-- UPDATE public.conciliacao_bancaria_itens SET grupo_id = NULL, tipo_aprovacao = 'manual'
--   WHERE tipo_aprovacao = 'agrupamento_legado';
-- DELETE FROM public.conciliacao_audit_log
--   WHERE acao = 'grupo_legado_identificado' AND motivo = 'backfill_pr_conc_grupo_fase1_1xN';
