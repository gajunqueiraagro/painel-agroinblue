
DROP FUNCTION IF EXISTS public.buscar_duplicados_retroativo(uuid);

CREATE FUNCTION public.buscar_duplicados_retroativo(_cliente_id uuid, _ano_mes text DEFAULT NULL)
RETURNS TABLE (
  grupo_hash text,
  lancamento_id uuid,
  data_pagamento date,
  ano_mes text,
  fazenda_id uuid,
  conta_bancaria_id uuid,
  tipo_operacao text,
  valor numeric,
  descricao text,
  fornecedor_nome text,
  numero_documento text,
  observacao text,
  subcentro text,
  lote_importacao_id uuid,
  created_at timestamptz,
  status_duplicidade text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    l.hash_importacao AS grupo_hash,
    l.id AS lancamento_id,
    l.data_pagamento,
    l.ano_mes,
    l.fazenda_id,
    l.conta_bancaria_id,
    l.tipo_operacao,
    l.valor,
    l.descricao,
    f.nome AS fornecedor_nome,
    l.numero_documento,
    l.observacao,
    l.subcentro,
    l.lote_importacao_id,
    l.created_at,
    l.status_duplicidade
  FROM public.financeiro_lancamentos_v2 l
  LEFT JOIN public.financeiro_fornecedores f ON f.id = l.favorecido_id
  WHERE l.cliente_id = _cliente_id
    AND l.cancelado = false
    AND l.hash_importacao IS NOT NULL
    AND (_ano_mes IS NULL OR l.ano_mes = _ano_mes)
    AND l.hash_importacao IN (
      SELECT h.hash_importacao
      FROM public.financeiro_lancamentos_v2 h
      WHERE h.cliente_id = _cliente_id
        AND h.cancelado = false
        AND h.hash_importacao IS NOT NULL
        AND (_ano_mes IS NULL OR h.ano_mes = _ano_mes)
      GROUP BY h.hash_importacao
      HAVING count(*) > 1
    )
  ORDER BY l.hash_importacao, l.created_at;
$$;
