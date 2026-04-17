-- fn_saldo_inicial_pasto: retorna SI de uma categoria com base no snapshot oficial
-- do mês anterior (soma de TODOS os pastos com status='fechado').
-- Retorna (0, 0) quando não há fechamento oficial no mês anterior — sinal para
-- o consumidor usar o fallback de saldos_iniciais.

CREATE OR REPLACE FUNCTION public.fn_saldo_inicial_pasto(
  p_fazenda_id uuid,
  p_ano int,
  p_mes int,
  p_categoria_codigo text
)
RETURNS TABLE (
  quantidade integer,
  peso_medio_kg numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ano_anterior int;
  v_mes_anterior int;
  v_ano_mes_anterior text;
  v_has_fechamento boolean;
BEGIN
  -- Calcula competência anterior
  IF p_mes = 1 THEN
    v_ano_anterior := p_ano - 1;
    v_mes_anterior := 12;
  ELSE
    v_ano_anterior := p_ano;
    v_mes_anterior := p_mes - 1;
  END IF;

  v_ano_mes_anterior := v_ano_anterior::text || '-' || lpad(v_mes_anterior::text, 2, '0');

  -- Verifica se existe ALGUM pasto fechado no mês anterior
  SELECT EXISTS (
    SELECT 1
    FROM public.fechamento_pastos fp
    WHERE fp.fazenda_id = p_fazenda_id
      AND fp.ano_mes    = v_ano_mes_anterior
      AND fp.status     = 'fechado'
  ) INTO v_has_fechamento;

  -- Sem fechamento oficial → caller deve usar fallback
  IF NOT v_has_fechamento THEN
    quantidade    := 0;
    peso_medio_kg := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Soma TODOS os pastos fechados do mês anterior para a categoria
  SELECT
    COALESCE(SUM(fpi.quantidade), 0)::int,
    CASE
      WHEN COALESCE(SUM(fpi.quantidade), 0) > 0
      THEN ROUND(
        (SUM(COALESCE(fpi.peso_medio_kg, 0) * fpi.quantidade)
          / NULLIF(SUM(fpi.quantidade), 0))::numeric, 2)
      ELSE 0::numeric
    END
  INTO quantidade, peso_medio_kg
  FROM public.fechamento_pasto_itens fpi
  JOIN public.fechamento_pastos     fp ON fp.id = fpi.fechamento_id
  JOIN public.categorias_rebanho    cr ON cr.id = fpi.categoria_id
  WHERE fp.fazenda_id = p_fazenda_id
    AND fp.ano_mes    = v_ano_mes_anterior
    AND fp.status     = 'fechado'
    AND cr.codigo     = p_categoria_codigo;

  RETURN NEXT;
END;
$function$;

-- Permissões: leitura para usuários autenticados
GRANT EXECUTE ON FUNCTION public.fn_saldo_inicial_pasto(uuid, int, int, text) TO authenticated;