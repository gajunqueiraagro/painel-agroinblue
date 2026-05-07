-- fix: refresh_zoot_cache(uuid, integer) usava SELECT * causando fragilidade
-- de schema (colunas extras na tabela vs view) e updated_at duplicado.
-- Corrigido para INSERT com colunas explícitas. saldo_sistema e saldo_p1
-- ficam NULL (não existem na view — preenchidos por triggers se necessário).

CREATE OR REPLACE FUNCTION public.refresh_zoot_cache(
  p_fazenda_id uuid,
  p_ano integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.zoot_mensal_cache
    WHERE fazenda_id = p_fazenda_id AND ano = p_ano;

  INSERT INTO public.zoot_mensal_cache (
    fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
    categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
    saldo_inicial, entradas_externas, saidas_externas,
    evol_cat_entrada, evol_cat_saida, saldo_final,
    peso_total_inicial, peso_total_final, peso_medio_inicial, peso_medio_final,
    peso_entradas_externas, peso_saidas_externas,
    peso_evol_cat_entrada, peso_evol_cat_saida,
    dias_mes, gmd, producao_biologica, fonte_oficial_mes,
    updated_at
  )
  SELECT
    fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
    categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
    saldo_inicial, entradas_externas, saidas_externas,
    evol_cat_entrada, evol_cat_saida, saldo_final,
    peso_total_inicial, peso_total_final, peso_medio_inicial, peso_medio_final,
    peso_entradas_externas, peso_saidas_externas,
    peso_evol_cat_entrada, peso_evol_cat_saida,
    dias_mes, gmd, producao_biologica, fonte_oficial_mes,
    now()
  FROM public.vw_zoot_categoria_mensal
  WHERE fazenda_id = p_fazenda_id AND ano = p_ano;
END;
$$;
