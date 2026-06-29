-- 20260629_pr_c_candidatos_financeiros.sql
-- PR C — fn_ws_candidatos_financeiros (read-only) + campo aditivo candidatos_financeiros na fn_ws_conciliacao.
--
-- Corrige o P0: a Estação ignorava lançamentos financeiros existentes (perna-espelho
-- de transferência que casa pelo lado conta_destino_id ficava invisível, induzindo
-- criação duplicada). Esta migration:
--   (a) cria fn_ws_candidatos_financeiros(uuid) — LEITURA isolada, cross-account, acha
--       candidatos por natureza financeira (valor exato + janela ±5d + match conta/lado
--       + guard de sinal); classifica livre/alerta_mesmo_extrato/alerta_outro_extrato.
--   (b) altera fn_ws_conciliacao de forma ADITIVA: 1 chave nova `candidatos_financeiros`
--       no jsonb final (só para tipo extrato_sem_vinculo; senão '[]'). `sugestoes` e o
--       restante do payload permanecem IDÊNTICOS.
--
-- Corpos materializados a partir do banco VIVO (pg_get_functiondef após CREATE OR REPLACE
-- no proto binbcdfbisgscrifztia + validação A/B/C). NÃO reconstruído de memória.
-- Forward-only (o repo não usa par *_down.sql). Read-only: ZERO escrita em tabelas de dados.

-- =====================================================================================
-- (a) FUNÇÃO NOVA — read-only (SECURITY INVOKER, default; search_path fixo)
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.fn_ws_candidatos_financeiros(p_extrato_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH ofx AS (
  SELECT e.id, e.cliente_id, e.valor, e.data_movimento AS data_mov,
         e.conta_bancaria_id AS conta,
         CASE WHEN e.tipo_movimento = 'credito' THEN 1 ELSE -1 END AS sinal_ofx
  FROM extrato_bancario_v2 e
  WHERE e.id = p_extrato_id
),
cand AS (
  SELECT
    l.id, l.valor, l.sinal, l.data_pagamento, l.data_competencia,
    l.tipo_operacao, l.status_transacao, l.origem_lancamento, l.descricao,
    l.conta_bancaria_id, l.conta_destino_id,
    o.conta AS ofx_conta, o.data_mov, o.sinal_ofx,
    CASE WHEN l.conta_destino_id = o.conta THEN 'destino'
         WHEN l.conta_bancaria_id = o.conta THEN 'origem' END AS lado_match,
    (l.data_pagamento = o.data_mov) AS data_pgto_exata,
    LEAST(
      abs(COALESCE(l.data_pagamento   - o.data_mov, 999)),
      abs(COALESCE(l.data_competencia - o.data_mov, 999))
    ) AS dist_dias,
    CASE
      WHEN l.data_pagamento = o.data_mov AND l.data_competencia = o.data_mov THEN 'ambas'
      WHEN l.data_pagamento BETWEEN o.data_mov-5 AND o.data_mov+5 THEN 'pagamento'
      ELSE 'competencia'
    END AS qual_data,
    EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c
            WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL
              AND c.extrato_id = p_extrato_id) AS cbi_neste,
    EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c
            WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL
              AND c.extrato_id <> p_extrato_id) AS cbi_outro,
    EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c
            WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL) AS cbi_qualquer
  FROM ofx o
  JOIN financeiro_lancamentos_v2 l
    ON l.cliente_id = o.cliente_id
   AND l.cancelado = false
   AND l.sem_movimentacao_caixa = false
   AND l.status_transacao IN ('realizado','programado')
   AND abs(l.valor) = abs(o.valor)
   AND (
        (l.data_pagamento   BETWEEN o.data_mov-5 AND o.data_mov+5)
     OR (l.data_competencia BETWEEN o.data_mov-5 AND o.data_mov+5)
       )
   AND (
        ( l.tipo_operacao = '3-Transferências' AND (
            (o.sinal_ofx > 0 AND l.conta_destino_id  = o.conta)
         OR (o.sinal_ofx < 0 AND l.conta_bancaria_id = o.conta)
        ))
        OR
        ( l.tipo_operacao <> '3-Transferências'
          AND l.conta_bancaria_id = o.conta
          AND l.sinal::int = o.sinal_ofx )
       )
),
scored AS (
  SELECT cand.*,
    LEAST(100,
      40 + 30
      + GREATEST(0, 20 - 4*dist_dias)
      + CASE WHEN tipo_operacao = '3-Transferências' THEN 10 ELSE 0 END
    ) AS score,
    CASE WHEN NOT cbi_qualquer THEN 'livre'
         WHEN cbi_neste THEN 'alerta_mesmo_extrato'
         ELSE 'alerta_outro_extrato' END AS classificacao
  FROM cand
)
SELECT COALESCE(jsonb_agg(
  jsonb_build_object(
    'lancamento_id', s.id,
    'valor', s.valor,
    'sinal', s.sinal,
    'data_pagamento', s.data_pagamento,
    'data_competencia', s.data_competencia,
    'tipo_operacao', s.tipo_operacao,
    'status_transacao', s.status_transacao,
    'origem_lancamento', s.origem_lancamento,
    'descricao', s.descricao,
    'conta_bancaria_id', s.conta_bancaria_id,
    'conta_bancaria_nome', (SELECT nome_exibicao FROM financeiro_contas_bancarias WHERE id = s.conta_bancaria_id),
    'conta_destino_id', s.conta_destino_id,
    'conta_destino_nome', (SELECT nome_exibicao FROM financeiro_contas_bancarias WHERE id = s.conta_destino_id),
    'lado_match', s.lado_match,
    'qual_data', s.qual_data,
    'classificacao', s.classificacao,
    'score', s.score,
    'criterios', jsonb_build_object(
      'valor_exato', true,
      'conta_lado_ok', true,
      'data_exata', s.data_pgto_exata,
      'tipo_transferencia', (s.tipo_operacao = '3-Transferências')
    )
  )
  ORDER BY (s.classificacao = 'livre') DESC, s.score DESC, s.data_pagamento ASC
), '[]'::jsonb)
FROM scored s;
$function$;

REVOKE ALL ON FUNCTION public.fn_ws_candidatos_financeiros(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_ws_candidatos_financeiros(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_ws_candidatos_financeiros(uuid) TO authenticated;

-- =====================================================================================
-- (b) fn_ws_conciliacao — alteração ADITIVA: chave candidatos_financeiros no jsonb final.
--     Corpo materializado do banco vivo; única diferença vs. ws-01 anterior é a nova chave.
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.fn_ws_conciliacao(p_tipo text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_sistema jsonb := NULL;
  v_ofx jsonb := NULL;
  v_sugestoes jsonb := '[]'::jsonb;
  v_contexto jsonb;
  v_cliente uuid;
  v_conta uuid;
  v_anomes text;
  v_val numeric;
  v_sinal int;
  v_data date;
  v_ancora_cancelada boolean := false;
  v_vincular boolean := false;
BEGIN
  IF p_tipo NOT IN ('sistema_sem_vinculo','extrato_sem_vinculo') THEN
    RAISE EXCEPTION 'tipo nao suportado no WS0: %', p_tipo;
  END IF;

  IF p_tipo = 'sistema_sem_vinculo' THEN
    SELECT l.cancelado INTO v_ancora_cancelada FROM financeiro_lancamentos_v2 l WHERE l.id = p_id;
    SELECT jsonb_build_object(
      'lancamento_id', l.id, 'data', l.data_pagamento, 'valor', l.valor,
      'sinal', l.sinal, 'descricao', l.descricao, 'historico', l.historico,
      'status_transacao', l.status_transacao, 'origem_lancamento', l.origem_lancamento,
      'favorecido_id', l.favorecido_id, 'favorecido_nome', f.nome,
      'centro_custo', l.centro_custo, 'subcentro', l.subcentro,
      'grupo_custo', l.grupo_custo, 'macro_custo', l.macro_custo,
      'escopo_negocio', l.escopo_negocio, 'plano_conta_id', l.plano_conta_id,
      'conta_bancaria_id', l.conta_bancaria_id, 'conta_bancaria_nome', c1.nome_exibicao,
      'conta_destino_id', l.conta_destino_id, 'conta_destino_nome', c2.nome_exibicao,
      'observacao', l.observacao, 'documento', l.documento,
      'numero_documento', l.numero_documento, 'tipo_documento', l.tipo_documento,
      'forma_pagamento', l.forma_pagamento, 'dados_pagamento', l.dados_pagamento,
      'duplicidade', jsonb_build_object(
        'status_duplicidade', l.status_duplicidade, 'nivel_duplicidade', l.nivel_duplicidade,
        'duplicado_de_id', l.duplicado_de_id),
      'relacionamentos', jsonb_build_object(
        'transferencia_grupo_id', l.transferencia_grupo_id, 'contrato_id', l.contrato_id,
        'financiamento_id', l.financiamento_id, 'movimentacao_rebanho_id', l.movimentacao_rebanho_id,
        'boitel_id', l.boitel_id)
    ), l.cliente_id, l.conta_bancaria_id, l.ano_mes, abs(l.valor), CASE WHEN l.sinal='-1' THEN -1 ELSE 1 END, l.data_pagamento
    INTO v_sistema, v_cliente, v_conta, v_anomes, v_val, v_sinal, v_data
    FROM financeiro_lancamentos_v2 l
    LEFT JOIN financeiro_fornecedores f ON f.id = l.favorecido_id
    LEFT JOIN financeiro_contas_bancarias c1 ON c1.id = l.conta_bancaria_id
    LEFT JOIN financeiro_contas_bancarias c2 ON c2.id = l.conta_destino_id
    WHERE l.id = p_id;

    IF v_sistema IS NULL THEN RAISE EXCEPTION 'lancamento nao encontrado: %', p_id; END IF;

    SELECT coalesce(jsonb_agg(s ORDER BY (s->'criterios'->>'data_igual') DESC, (s->'candidato')::text ASC), '[]'::jsonb)
    INTO v_sugestoes
    FROM (
      SELECT jsonb_build_object(
        'tipo','ofx_para_sistema',
        'confianca', CASE WHEN e.data_movimento = v_data THEN 'alta' ELSE 'media' END,
        'candidato', jsonb_build_object('extrato_id', e.id, 'data', e.data_movimento,
          'valor', e.valor, 'descricao', e.descricao, 'origem', 'Extrato'),
        'criterios', jsonb_build_object('valor_igual', true, 'mesmo_sinal', true,
          'data_igual', (e.data_movimento = v_data),
          'descricao_semelhante', NULL, 'mesmo_banco', NULL,
          'existem_outros_candidatos', false)
      ) AS s
      FROM extrato_bancario_v2 e
      WHERE e.cliente_id = v_cliente AND abs(e.valor) = v_val
        AND sign(e.valor) = v_sinal AND (v_conta IS NULL OR e.conta_bancaria_id = v_conta)
      LIMIT 20
    ) z;

  ELSE
    SELECT jsonb_build_object(
      'extrato_id', e.id, 'data', e.data_movimento, 'valor', e.valor,
      'tipo_movimento', e.tipo_movimento, 'descricao', e.descricao, 'documento', e.documento,
      'saldo_apos', e.saldo_apos, 'conta_bancaria_id', e.conta_bancaria_id,
      'conta_bancaria_nome', c.nome_exibicao, 'importacao_id', e.importacao_id,
      'arquivo_nome', imp.nome_arquivo, 'hash_movimento', e.hash_movimento,
      'suspeita', jsonb_build_object('flag_suspeita_valor', e.flag_suspeita_valor,
        'flag_suspeita_fornecedor', e.flag_suspeita_fornecedor, 'flag_suspeita_motivo', e.flag_suspeita_motivo)
    ), e.cliente_id, e.conta_bancaria_id, abs(e.valor), sign(e.valor)::int, e.data_movimento
    INTO v_ofx, v_cliente, v_conta, v_val, v_sinal, v_data
    FROM extrato_bancario_v2 e
    LEFT JOIN financeiro_contas_bancarias c ON c.id = e.conta_bancaria_id
    LEFT JOIN financeiro_importacoes_v2 imp ON imp.id = e.importacao_id
    WHERE e.id = p_id;

    IF v_ofx IS NULL THEN RAISE EXCEPTION 'extrato nao encontrado: %', p_id; END IF;

    SELECT coalesce(jsonb_agg(s ORDER BY (s->'criterios'->>'data_igual') DESC, (s->'candidato')::text ASC), '[]'::jsonb)
    INTO v_sugestoes
    FROM (
      SELECT jsonb_build_object(
        'tipo','sistema_para_ofx',
        'confianca', CASE WHEN l.data_pagamento = v_data THEN 'alta' ELSE 'media' END,
        'candidato', jsonb_build_object('lancamento_id', l.id, 'data', l.data_pagamento,
          'valor', l.valor, 'descricao', l.descricao, 'origem', l.origem_lancamento),
        'criterios', jsonb_build_object('valor_igual', true, 'mesmo_sinal', true,
          'data_igual', (l.data_pagamento = v_data),
          'descricao_semelhante', NULL, 'mesmo_banco', NULL,
          'existem_outros_candidatos', false)
      ) AS s
      FROM financeiro_lancamentos_v2 l
      WHERE l.cliente_id = v_cliente AND l.cancelado = false AND abs(l.valor) = v_val
        AND (CASE WHEN l.sinal='-1' THEN -1 ELSE 1 END) = v_sinal
        AND l.conta_bancaria_id = v_conta
      LIMIT 20
    ) z;
    SELECT to_char(data_movimento,'YYYY-MM') INTO v_anomes FROM extrato_bancario_v2 WHERE id=p_id;
  END IF;

  v_contexto := jsonb_build_object('cliente_id', v_cliente, 'conta_bancaria_id', v_conta, 'ano_mes', v_anomes);

  v_vincular := (
    jsonb_array_length(v_sugestoes) = 1
    AND (v_sugestoes->0->>'confianca') = 'alta'
    AND (v_sugestoes->0->'criterios'->>'valor_igual') = 'true'
    AND (v_sugestoes->0->'criterios'->>'mesmo_sinal') = 'true'
    AND (v_sugestoes->0->'criterios'->>'data_igual') = 'true'
    AND v_ancora_cancelada = false
    AND NOT EXISTS (
      SELECT 1 FROM conciliacao_bancaria_itens c
      WHERE c.desfeito_em IS NULL
        AND c.extrato_id = COALESCE(
          NULLIF(v_sugestoes->0->'candidato'->>'extrato_id','')::uuid,
          CASE WHEN p_tipo = 'extrato_sem_vinculo' THEN p_id ELSE NULL END
        )
    )
  );

  RETURN jsonb_build_object(
    'versao','ws-01-readonly', 'tipo', p_tipo, 'contexto', v_contexto,
    'sistema', v_sistema, 'ofx', v_ofx, 'sugestoes', v_sugestoes,
    'lacunas', jsonb_build_array(
      jsonb_build_object('campo','produto','motivo','nao_existe_na_origem'),
      jsonb_build_object('campo','fitid','motivo','nao_existe_na_origem'),
      jsonb_build_object('campo','anexo_nf','motivo','nao_existe_na_origem')),
    'acoes_disponiveis', jsonb_build_object('vincular',v_vincular,'editar',false,'criar',false,'ignorar',false),
    'candidatos_financeiros',
      CASE WHEN p_tipo = 'extrato_sem_vinculo'
           THEN COALESCE(public.fn_ws_candidatos_financeiros(p_id), '[]'::jsonb)
           ELSE '[]'::jsonb END
  );
END;
$function$;
