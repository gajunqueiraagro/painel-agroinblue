-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: corrigir as 3 variantes de refresh_zoot_cache
--
-- Problemas corrigidos:
-- 1. EXCEPTION WHEN OTHERS THEN NULL mascarava erros e mantinha cache stale
-- 2. SELECT * dependia de ordem de colunas — substituído por lista explícita
-- 3. Variante (uuid, integer, integer DEFAULT NULL) criava ambiguidade com
--    (uuid, integer) — recriada sem DEFAULT
-- ═══════════════════════════════════════════════════════════════════════════

-- VARIANTE 1: (uuid, integer) — principal, todos os cenários do ano
CREATE OR REPLACE FUNCTION refresh_zoot_cache(p_fazenda_id uuid, p_ano integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.zoot_mensal_cache
    WHERE fazenda_id = p_fazenda_id AND ano = p_ano;

  INSERT INTO public.zoot_mensal_cache (
    fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
    categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
    saldo_inicial, entradas_externas, saidas_externas,
    evol_cat_entrada, evol_cat_saida, saldo_final,
    peso_total_inicial, peso_total_final,
    peso_medio_inicial, peso_medio_final,
    peso_entradas_externas, peso_saidas_externas,
    peso_evol_cat_entrada, peso_evol_cat_saida,
    dias_mes, gmd, producao_biologica,
    fonte_oficial_mes, saldo_sistema, saldo_p1,
    updated_at
  )
  SELECT
    fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
    categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
    saldo_inicial, entradas_externas, saidas_externas,
    evol_cat_entrada, evol_cat_saida, saldo_final,
    peso_total_inicial, peso_total_final,
    peso_medio_inicial, peso_medio_final,
    peso_entradas_externas, peso_saidas_externas,
    peso_evol_cat_entrada, peso_evol_cat_saida,
    dias_mes, gmd, producao_biologica,
    fonte_oficial_mes, saldo_sistema, saldo_p1,
    now()
  FROM public.vw_zoot_categoria_mensal
  WHERE fazenda_id = p_fazenda_id AND ano = p_ano;
END;
$$;

-- VARIANTE 2: (uuid, integer, integer) — filtro por mês, sem DEFAULT
-- DROP antes de recriar para evitar conflito de assinatura
DROP FUNCTION IF EXISTS refresh_zoot_cache(uuid, integer, integer);
CREATE FUNCTION refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_mes integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.zoot_mensal_cache
    WHERE fazenda_id = p_fazenda_id AND ano = p_ano AND mes = p_mes;

  INSERT INTO public.zoot_mensal_cache (
    fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
    categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
    saldo_inicial, entradas_externas, saidas_externas,
    evol_cat_entrada, evol_cat_saida, saldo_final,
    peso_total_inicial, peso_total_final,
    peso_medio_inicial, peso_medio_final,
    peso_entradas_externas, peso_saidas_externas,
    peso_evol_cat_entrada, peso_evol_cat_saida,
    dias_mes, gmd, producao_biologica,
    fonte_oficial_mes, saldo_sistema, saldo_p1,
    updated_at
  )
  SELECT
    fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
    categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
    saldo_inicial, entradas_externas, saidas_externas,
    evol_cat_entrada, evol_cat_saida, saldo_final,
    peso_total_inicial, peso_total_final,
    peso_medio_inicial, peso_medio_final,
    peso_entradas_externas, peso_saidas_externas,
    peso_evol_cat_entrada, peso_evol_cat_saida,
    dias_mes, gmd, producao_biologica,
    fonte_oficial_mes, saldo_sistema, saldo_p1,
    now()
  FROM public.vw_zoot_categoria_mensal
  WHERE fazenda_id = p_fazenda_id AND ano = p_ano AND mes = p_mes;
END;
$$;

-- VARIANTE 3: (uuid, integer, text) — filtro por cenário
CREATE OR REPLACE FUNCTION refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_cenario text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.zoot_mensal_cache
    WHERE fazenda_id = p_fazenda_id AND ano = p_ano AND cenario = p_cenario;

  INSERT INTO public.zoot_mensal_cache (
    fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
    categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
    saldo_inicial, entradas_externas, saidas_externas,
    evol_cat_entrada, evol_cat_saida, saldo_final,
    peso_total_inicial, peso_total_final,
    peso_medio_inicial, peso_medio_final,
    peso_entradas_externas, peso_saidas_externas,
    peso_evol_cat_entrada, peso_evol_cat_saida,
    dias_mes, gmd, producao_biologica,
    fonte_oficial_mes, saldo_sistema, saldo_p1,
    updated_at
  )
  SELECT
    fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
    categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
    saldo_inicial, entradas_externas, saidas_externas,
    evol_cat_entrada, evol_cat_saida, saldo_final,
    peso_total_inicial, peso_total_final,
    peso_medio_inicial, peso_medio_final,
    peso_entradas_externas, peso_saidas_externas,
    peso_evol_cat_entrada, peso_evol_cat_saida,
    dias_mes, gmd, producao_biologica,
    fonte_oficial_mes, saldo_sistema, saldo_p1,
    now()
  FROM public.vw_zoot_categoria_mensal
  WHERE fazenda_id = p_fazenda_id AND ano = p_ano AND cenario = p_cenario;
END;
$$;
