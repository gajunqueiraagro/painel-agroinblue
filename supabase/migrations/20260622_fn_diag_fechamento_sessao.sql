-- 20260622_fn_diag_fechamento_sessao.sql
-- DIAG-01 — Painel Executivo de Fechamento (RPC unico por sessao).
-- Retorna jsonb agregado para a sessao: cobertura OFX, problemas (buckets
-- nomeados), status saidas, origem dos lancamentos e entradas.
-- Render-only: o front so exibe; nenhuma acao deriva daqui.
-- NAO aplicada automaticamente: este arquivo versiona o estado; a aplicacao
-- no proto e feita manualmente a partir desta versao IDENTICA (zero divergencia
-- banco x migration).
--
-- ════════════════════════════════════════════════════════════════
-- INVARIANTE ARQUITETURAL (nao remover):
-- E PROIBIDO derivar origem.via_mesa usando origem_lancamento.
-- via_mesa/ofx_direto devem ser calculados EXCLUSIVAMENTE pelo vinculo
-- mesa_lancamento_staging.lancamento_v2_id. origem_lancamento='ofx'
-- contem TANTO promovidos da Mesa QUANTO OFX-direto — agrupar por ele
-- faz o painel MENTIR (Mesa some dentro de 'ofx').
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_diag_fechamento_sessao(p_sessao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE s record; v jsonb;
BEGIN
  SELECT cliente_id, conta_bancaria_id, ano_mes INTO s FROM mesa_sessao WHERE id = p_sessao_id;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;

  WITH
  ofx AS (
    SELECT * FROM extrato_bancario_v2 e
    WHERE e.cliente_id = s.cliente_id AND e.conta_bancaria_id = s.conta_bancaria_id
      AND to_char(e.data_movimento, 'YYYY-MM') = s.ano_mes
      AND e.cancelado_em IS NULL AND e.status <> 'ignorado'
  ),
  sis AS (
    SELECT * FROM financeiro_lancamentos_v2 f
    WHERE f.cliente_id = s.cliente_id AND f.conta_bancaria_id = s.conta_bancaria_id AND f.ano_mes = s.ano_mes
      AND f.cancelado = false AND f.sem_movimentacao_caixa = false AND f.cenario = 'realizado'
  ),
  stg AS (
    SELECT st.* FROM mesa_lancamento_staging st
    JOIN mesa_sessao ms ON ms.id = st.sessao_id
    WHERE ms.cliente_id = s.cliente_id AND st.conta_resolvida_id = s.conta_bancaria_id AND ms.ano_mes = s.ano_mes
  )
  SELECT jsonb_build_object(
    'ano_mes', s.ano_mes,
    'cobertura', jsonb_build_object(
      'ofx_validos', (SELECT count(*) FROM ofx),
      -- "Com Excel" exige um staging NAO-descartado apontando: descartar nao cobre.
      'com_excel',   (SELECT count(*) FROM ofx e WHERE EXISTS (
                        SELECT 1 FROM mesa_lancamento_staging x
                        WHERE x.ofx_extrato_id = e.id AND x.status_promocao <> 'descartado')),
      'sem_excel',   (SELECT count(*) FROM ofx e WHERE NOT EXISTS (
                        SELECT 1 FROM mesa_lancamento_staging x
                        WHERE x.ofx_extrato_id = e.id AND x.status_promocao <> 'descartado')),
      'promovidos',  (SELECT count(*) FROM stg WHERE status_promocao = 'promovido'),
      'pendentes',   (SELECT count(*) FROM stg WHERE status_promocao = 'pendente')
    ),
    -- 'problemas': buckets de pendencia NOMEADOS (nenhum pendente fica invisivel),
    -- depois residual 'outros', e por fim ofx_sem_excel (lado OFX).
    -- INVARIANTE: soma dos buckets 1..6 === cobertura.pendentes.
    'problemas', (
      SELECT coalesce(jsonb_agg(p ORDER BY ord), '[]'::jsonb) FROM (
        SELECT 1 ord, jsonb_build_object('tipo','correcao_manual','label','Correção manual',
          'count',count(*),'valor',coalesce(sum(valor),0),'filtro','pendente:correcao_manual') p
          FROM stg WHERE status_promocao = 'pendente' AND motivo_pendencia = 'correcao_manual' HAVING count(*) > 0
        UNION ALL
        SELECT 2, jsonb_build_object('tipo','ofx_duplicado','label','OFX duplicado',
          'count',count(*),'valor',coalesce(sum(valor),0),'filtro','pendente:ofx_duplicado')
          FROM stg WHERE status_promocao = 'pendente' AND motivo_pendencia = 'ofx_duplicado' HAVING count(*) > 0
        UNION ALL
        SELECT 3, jsonb_build_object('tipo','ambiguo','label','Ambíguo',
          'count',count(*),'valor',coalesce(sum(valor),0),'filtro','pendente:ambiguo')
          FROM stg WHERE status_promocao = 'pendente' AND motivo_pendencia = 'ambiguo' HAVING count(*) > 0
        UNION ALL
        SELECT 4, jsonb_build_object('tipo','divergencia','label','Divergência valor/data',
          'count',count(*),'valor',coalesce(sum(valor),0),'filtro','pendente:divergencia')
          FROM stg WHERE status_promocao = 'pendente' AND motivo_pendencia = 'divergencia' HAVING count(*) > 0
        UNION ALL
        SELECT 5, jsonb_build_object('tipo','sem_motivo','label','Sem motivo',
          'count',count(*),'valor',coalesce(sum(valor),0),'filtro','pendente:sem_motivo')
          FROM stg WHERE status_promocao = 'pendente' AND motivo_pendencia IS NULL HAVING count(*) > 0
        UNION ALL
        SELECT 6, jsonb_build_object('tipo','outros','label','Outros',
          'count',count(*),'valor',coalesce(sum(valor),0),'filtro','pendente:outros')
          FROM stg WHERE status_promocao = 'pendente'
            AND motivo_pendencia IS NOT NULL
            AND motivo_pendencia NOT IN ('correcao_manual','ofx_duplicado','ambiguo','divergencia')
          HAVING count(*) > 0
        UNION ALL
        SELECT 7, jsonb_build_object('tipo','ofx_sem_excel','label','OFX sem Excel',
          'count',count(*),'valor',coalesce(sum(abs(valor)),0),'filtro','ofx_sem_excel')
          FROM ofx e WHERE NOT EXISTS (
            SELECT 1 FROM mesa_lancamento_staging x
            WHERE x.ofx_extrato_id = e.id AND x.status_promocao <> 'descartado') HAVING count(*) > 0
        -- sistema_sem_ofx: FORA DESTA FATIA (definicao correta depende do OFX x SISTEMA)
      ) q
    ),
    'status', jsonb_build_object(
      'ofx_saidas',     (SELECT coalesce(sum(abs(valor)),0) FROM ofx WHERE tipo_movimento = 'debito'),
      'sistema_saidas', (SELECT coalesce(sum(valor),0)      FROM sis WHERE sinal = '-1'),
      'divergencia',    (SELECT coalesce(sum(valor),0) FROM sis WHERE sinal = '-1')
                      - (SELECT coalesce(sum(abs(valor)),0) FROM ofx WHERE tipo_movimento = 'debito')
    ),
    'origem', jsonb_build_object(  -- VIA VINCULO (ver INVARIANTE no topo) — nunca origem_lancamento
      'via_mesa',   (SELECT count(*) FROM sis f WHERE EXISTS (SELECT 1 FROM mesa_lancamento_staging x WHERE x.lancamento_v2_id = f.id)),
      'ofx_direto', (SELECT count(*) FROM sis f WHERE NOT EXISTS (SELECT 1 FROM mesa_lancamento_staging x WHERE x.lancamento_v2_id = f.id) AND f.origem_lancamento = 'ofx'),
      'manual',     (SELECT count(*) FROM sis WHERE origem_lancamento = 'manual'),
      'importacao', (SELECT count(*) FROM sis WHERE origem_lancamento LIKE 'importacao%'),
      'migracao',   (SELECT count(*) FROM sis WHERE origem_lancamento = 'migracao'),
      -- residual: o banco tem ~12 valores de origem_lancamento, nao 5.
      'outras',     (SELECT count(*) FROM sis
                       WHERE coalesce(origem_lancamento,'(sem)') <> 'ofx'
                         AND coalesce(origem_lancamento,'(sem)') <> 'manual'
                         AND coalesce(origem_lancamento,'(sem)') <> 'migracao'
                         AND coalesce(origem_lancamento,'(sem)') NOT LIKE 'importacao%')
    ),
    'entradas', jsonb_build_object(
      'ofx',         (SELECT coalesce(sum(valor),0) FROM ofx WHERE tipo_movimento = 'credito'),
      'sistema',     (SELECT coalesce(sum(valor),0) FROM sis WHERE sinal = '1'),
      'a_conciliar', (SELECT coalesce(sum(valor),0) FROM ofx WHERE tipo_movimento = 'credito')
                   - (SELECT coalesce(sum(valor),0) FROM sis WHERE sinal = '1')
    )
  ) INTO v;

  RETURN v;
END $$;
