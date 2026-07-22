-- PR-OC2-SALDO — Regra canônica de saldo das Operações Comerciais (ADR-2026-17 §23.9).
--   Unifica a semântica de saldo/estado de liquidação entre vw_oc_titulos_liquidacao,
--   vw_oc_operacao_liquidacao e oc_derivar_status numa fonte canônica reutilizável.
--   Decisões aprovadas: D1 tolerância absoluta R$ 0,01; D2 base por precedência
--   final > acordado > estimado > indefinida (base de OPERAÇÃO), onde "final" exige valor
--   final CONFIRMADO (rascunho=false + status_comercial=fechada + parte principal incluída).
--   O título usa o próprio valor do título FINV2 como base (granularidade — não a precedência).
--   Escopo: SOMENTE regra de saldo. NÃO toca oc_sincronizar, sem_movimentacao_caixa,
--   componentes, writers legados, títulos existentes, dados, backfill ou UI.
--   Estornos (estornado=true) continuam fora de todas as somas (append-only preservado).
--   Tenant-safe preservado (security_invoker nas views; RPC SECDEF já guardada).
-- NÃO aplicar por este PR (aplicação remota é etapa separada, sob autorização).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fonte canônica 1 — CLASSIFICADOR de estado de liquidação (tolerância R$ 0,01).
--   Contrato canônico (ADR-2026-17):
--     base NULL                 -> 'base_indefinida'  (saldo permanece NULL no chamador)
--     abs(base - liquidado)<=0,01 -> 'liquidada'
--     (base - liquidado) < -0,01  -> 'excedente'
--     liquidado <= 0              -> 'nao_iniciada'
--     senão                       -> 'parcial'
--   IMMUTABLE, puro (sem acesso a tabela). É a ÚNICA definição da tolerância.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._oc_estado_liquidacao(p_base numeric, p_liquidado numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_base IS NULL                                    THEN 'base_indefinida'
    WHEN abs(p_base - COALESCE(p_liquidado, 0)) <= 0.01    THEN 'liquidada'
    WHEN (p_base - COALESCE(p_liquidado, 0)) < -0.01       THEN 'excedente'
    WHEN COALESCE(p_liquidado, 0) <= 0                     THEN 'nao_iniciada'
    ELSE 'parcial'
  END;
$$;

COMMENT ON FUNCTION public._oc_estado_liquidacao(numeric, numeric) IS
  'PR-OC2-SALDO: classificador canônico de estado de liquidação. Tolerância única R$ 0,01 (D1). base NULL -> base_indefinida; abs(saldo)<=0,01 -> liquidada; saldo<-0,01 -> excedente; liquidado<=0 -> nao_iniciada; senão parcial. Consumido pelas duas views e por oc_derivar_status.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fonte canônica 2 — BASE de saldo por OPERAÇÃO (precedência D2).
--   final = valor_total SOMENTE quando há "valor final confirmado": operação NÃO rascunho
--     E status_comercial='fechada' E existe parte principal INCLUÍDA no total com valor>0.
--     Operação programada ou em rascunho — mesmo com principal materializado — NÃO tem valor
--     final confirmado: aplica-se o fallback normal (acordado > estimado > indefinida).
--   Precedência: final > acordado (valor_acordado) > estimado (valor_estimado) > indefinida (NULL).
--   Predicado centralizado aqui (esta função é a abstração canônica suficiente — sem helper).
--   STABLE, SECURITY INVOKER (default): dentro das views security_invoker herda a RLS do
--   chamador; dentro de oc_derivar_status (SECDEF) o operacao_id já é tenant-validado.
--   Tabelas qualificadas com public.* (independe de search_path).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._oc_base_saldo_operacao(p_operacao_id uuid)
RETURNS TABLE(base numeric, base_origem text)
LANGUAGE sql
STABLE
AS $$
  WITH op AS (
    SELECT
      o.valor_total,
      o.valor_acordado,
      o.valor_estimado,
      (
        o.rascunho IS FALSE
        AND o.status_comercial = 'fechada'
        AND EXISTS (
          SELECT 1 FROM public.zoo_operacao_partes pt
           WHERE pt.operacao_id = o.id
             AND pt.natureza = 'principal'
             AND pt.incluso_no_total IS TRUE
             AND pt.valor > 0
        )
      ) AS tem_final
    FROM public.zoo_operacoes_comerciais o
    WHERE o.id = p_operacao_id
  )
  SELECT
    CASE
      WHEN tem_final                     THEN valor_total
      WHEN valor_acordado IS NOT NULL    THEN valor_acordado
      WHEN valor_estimado IS NOT NULL    THEN valor_estimado
      ELSE NULL
    END AS base,
    CASE
      WHEN tem_final                     THEN 'final'
      WHEN valor_acordado IS NOT NULL    THEN 'acordado'
      WHEN valor_estimado IS NOT NULL    THEN 'estimado'
      ELSE 'indefinida'
    END AS base_origem
  FROM op;
$$;

COMMENT ON FUNCTION public._oc_base_saldo_operacao(uuid) IS
  'PR-OC2-SALDO: base canônica de saldo por operação (D2). Precedência final > acordado > estimado > indefinida(NULL). final(valor_total) SOMENTE com valor final confirmado: rascunho=false E status_comercial=fechada E parte principal incluída valor>0; caso contrário (programada/rascunho) aplica-se o fallback acordado>estimado>indefinida. Consumido por vw_oc_operacao_liquidacao e por oc_derivar_status.';

-- Grants dos helpers (padrão OC): sem anon/PUBLIC; EXECUTE a authenticated.
REVOKE ALL ON FUNCTION public._oc_estado_liquidacao(numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._oc_base_saldo_operacao(uuid)           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._oc_estado_liquidacao(numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public._oc_base_saldo_operacao(uuid)           TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- View por TÍTULO — base = valor do título FINV2 (nominal do próprio título).
--   CREATE OR REPLACE preserva grants e colunas públicas (mesmas colunas, mesma ordem).
--   Vocabulário público preservado: nao_liquidado | parcial | quitado | excedente_divergente.
--   Mapeamento canônico→público: nao_iniciada->nao_liquidado; liquidada->quitado;
--   excedente->excedente_divergente; parcial->parcial. Caso especial cancelado preservado.
--   Mudança de comportamento: igualdade exata -> tolerância R$ 0,01 (D1).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_oc_titulos_liquidacao WITH (security_invoker = true) AS
WITH titulos AS (
  SELECT DISTINCT pt.cliente_id, pt.operacao_id, pt.financeiro_lancamento_id AS titulo_id
    FROM public.zoo_operacao_partes pt
   WHERE pt.financeiro_lancamento_id IS NOT NULL
),
liq AS (
  SELECT l.operacao_id, l.financeiro_lancamento_id AS titulo_id, sum(l.valor) AS total_liquidado_valido
    FROM public.zoo_operacao_liquidacoes l
   WHERE l.estornado = false AND l.financeiro_lancamento_id IS NOT NULL
   GROUP BY l.operacao_id, l.financeiro_lancamento_id
)
SELECT
  t.cliente_id,
  t.operacao_id,
  t.titulo_id,
  f.valor                                             AS valor_titulo,
  f.cancelado                                         AS titulo_cancelado,
  COALESCE(liq.total_liquidado_valido, 0)             AS total_liquidado_valido,
  f.valor - COALESCE(liq.total_liquidado_valido, 0)   AS saldo_titulo,
  CASE
    WHEN f.cancelado IS TRUE THEN 'excedente_divergente'
    ELSE (
      CASE public._oc_estado_liquidacao(f.valor, COALESCE(liq.total_liquidado_valido, 0))
        WHEN 'nao_iniciada' THEN 'nao_liquidado'
        WHEN 'liquidada'    THEN 'quitado'
        WHEN 'excedente'    THEN 'excedente_divergente'
        ELSE 'parcial'  -- 'parcial' (base_indefinida não ocorre: f.valor é NOT NULL)
      END
    )
  END                                                 AS estado
FROM titulos t
JOIN public.financeiro_lancamentos_v2 f ON f.id = t.titulo_id
LEFT JOIN liq ON liq.operacao_id = t.operacao_id AND liq.titulo_id = t.titulo_id
WHERE f.cancelado IS NOT TRUE
   OR COALESCE(liq.total_liquidado_valido, 0) > 0;

COMMENT ON VIEW public.vw_oc_titulos_liquidacao IS
  'ADR-2026-16 §2.4 / PR-OC2-SALDO: saldo por título (financeiro_lancamentos_v2 vinculado via zoo_operacao_partes). Base = valor do título. saldo_titulo = valor_titulo - Σ liquidações válidas (estornado=false). Estado derivado via _oc_estado_liquidacao (tolerância R$ 0,01, D1), mapeado ao vocabulário público (nao_liquidado|parcial|quitado|excedente_divergente); título cancelado -> excedente_divergente. Tenant-safe (security_invoker). Sem leitura de caixa.';

-- ─────────────────────────────────────────────────────────────────────────────
-- View por OPERAÇÃO — base = precedência canônica (_oc_base_saldo_operacao).
--   Colunas públicas preservadas + APÊNDICE de base/base_origem (compatível: CREATE OR
--   REPLACE permite adicionar colunas ao final) para tornar o saldo autoexplicável sob D2.
--   Vocabulário público preservado + novo estado base_indefinida (sem consumer ativo).
--   Mapeamento: nao_iniciada->nao_liquidada; liquidada->quitada; excedente->excedente;
--   base_indefinida->base_indefinida; parcial->parcial. saldo NULL quando base indefinida.
--   Mudanças vs vigente: base valor_total -> precedência; igualdade exata -> tolerância 0,01.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_oc_operacao_liquidacao WITH (security_invoker = true) AS
WITH liq AS (
  SELECT l.operacao_id, sum(l.valor) AS total_liquidado_valido
    FROM public.zoo_operacao_liquidacoes l
   WHERE l.estornado = false
   GROUP BY l.operacao_id
)
SELECT
  o.cliente_id,
  o.id                                                AS operacao_id,
  o.valor_total,
  COALESCE(liq.total_liquidado_valido, 0)             AS total_liquidado_valido,
  b.base - COALESCE(liq.total_liquidado_valido, 0)    AS saldo_operacao,  -- NULL se base indefinida
  CASE public._oc_estado_liquidacao(b.base, COALESCE(liq.total_liquidado_valido, 0))
    WHEN 'nao_iniciada'    THEN 'nao_liquidada'
    WHEN 'liquidada'       THEN 'quitada'
    WHEN 'excedente'       THEN 'excedente'
    WHEN 'base_indefinida' THEN 'base_indefinida'
    ELSE 'parcial'
  END                                                 AS estado_liquidacao,
  b.base                                              AS base,
  b.base_origem                                       AS base_origem
FROM public.zoo_operacoes_comerciais o
LEFT JOIN liq ON liq.operacao_id = o.id
LEFT JOIN LATERAL public._oc_base_saldo_operacao(o.id) b ON true;

COMMENT ON VIEW public.vw_oc_operacao_liquidacao IS
  'ADR-2026-16 §2.4 / PR-OC2-SALDO: saldo comercial da operação. Base canônica (D2, _oc_base_saldo_operacao): final(valor_total)>acordado>estimado>indefinida. saldo_operacao = base - Σ liquidações válidas (estornado=false); NULL se base indefinida. Estado via _oc_estado_liquidacao (tolerância R$ 0,01), mapeado a nao_liquidada|parcial|quitada|excedente|base_indefinida. Colunas base/base_origem apensadas. Tenant-safe (security_invoker). Sem leitura de caixa.';

-- Grants tenant-safe das views (reafirmados; CREATE OR REPLACE preserva, reafirmamos por segurança).
REVOKE ALL ON TABLE public.vw_oc_titulos_liquidacao   FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.vw_oc_operacao_liquidacao  FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.vw_oc_titulos_liquidacao  TO authenticated;
GRANT SELECT ON TABLE public.vw_oc_operacao_liquidacao TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- oc_derivar_status — passa a consumir a fonte canônica na parte de LIQUIDAÇÃO.
--   Preserva: assinatura (uuid,uuid), SECDEF, STABLE, search_path, guarda de tenant,
--   eixo ANIMAIS e a estrutura do JSON de retorno. Muda apenas base/estado de liquidação
--   para a regra canônica. Nota: no caso base indefinida, o estado agora é sempre
--   'base_indefinida' (antes retornava 'nao_iniciada' quando não havia liquidação) —
--   alinhamento ao contrato canônico (D2). Vocabulário público de status inalterado.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_derivar_status(p_operacao_id uuid, p_cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op public.zoo_operacoes_comerciais;
  v_soma_ef numeric;
  v_dif numeric;
  v_base numeric;
  v_base_origem text;
  v_liq numeric;
  v_st_animais text;
  v_st_liq text;
BEGIN
  IF NOT (public.is_admin_agroinblue(auth.uid()) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id AND cliente_id = p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;

  SELECT COALESCE(sum(l.quantidade), 0) INTO v_soma_ef
    FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id = m.movimentacao_id
   WHERE m.operacao_id = p_operacao_id AND l.cancelado IS NOT TRUE;
  v_dif := v_soma_ef - COALESCE(v_op.qtd_negociada, 0);

  -- ANIMAIS (excedente antes do encerramento continua 'parcial' — Decisão 6)
  IF NOT v_op.entrega_encerrada THEN
    v_st_animais := CASE WHEN v_soma_ef = 0 THEN 'nao_iniciado' ELSE 'parcial' END;
  ELSE
    v_st_animais := CASE WHEN v_op.qtd_negociada IS NOT NULL AND v_soma_ef = v_op.qtd_negociada
                         THEN 'concluido' ELSE 'concluido_com_diferenca' END;
  END IF;

  -- LIQUIDAÇÃO — base e estado pela fonte canônica (PR-OC2-SALDO).
  SELECT base, base_origem INTO v_base, v_base_origem
    FROM public._oc_base_saldo_operacao(p_operacao_id);

  SELECT COALESCE(sum(valor), 0) INTO v_liq
    FROM public.zoo_operacao_liquidacoes WHERE operacao_id = p_operacao_id AND estornado IS NOT TRUE;

  v_st_liq := public._oc_estado_liquidacao(v_base, v_liq);

  RETURN jsonb_build_object(
    'comercial', v_op.status_comercial, 'rascunho', v_op.rascunho,
    'animais', jsonb_build_object(
      'status_animais', v_st_animais, 'quantidade_negociada', v_op.qtd_negociada,
      'quantidade_efetiva', v_soma_ef, 'diferenca_quantidade', v_dif, 'entrega_encerrada', v_op.entrega_encerrada),
    'liquidacao', jsonb_build_object(
      'status_liquidacao', v_st_liq, 'base', v_base, 'base_origem', v_base_origem,
      'total_liquidado', v_liq, 'saldo', CASE WHEN v_base IS NULL THEN NULL ELSE v_base - v_liq END));
END;
$$;

-- Grants (padrão OC; reafirmados).
REVOKE ALL ON FUNCTION public.oc_derivar_status(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_derivar_status(uuid, uuid) TO authenticated;
