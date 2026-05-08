-- perf(zoo): acelerar refresh_zoot_cache usando função filtrada
--
-- Antes: as 3 sobrecargas de refresh_zoot_cache faziam
--   INSERT ... SELECT ... FROM vw_zoot_categoria_mensal WHERE fazenda_id=X AND ano=Y
-- A view contém uma CTE recursiva (chain) que é optimization fence no Postgres,
-- então o predicado fazenda_id=X NÃO era empurrado para dentro. A view computava
-- ~12k linhas e filtrava no fim, gerando 6.5M de page reads e ~24,5s por fazenda.
--
-- Depois: troca para fn_zoot_categoria_mensal(p_fazenda_id, p_ano[, p_cenario]),
-- que tem o mesmo SQL final da view porém com filtros embutidos em cada CTE
-- interna (saldo_ini_cat, mov_real, mov_meta, rcl_*, etc.) — ~180ms por fazenda.
--
-- Ganho medido (Vera Ligia 2026, 3 fazendas):
--   fn_zoot_cache_rebuild: 76.000ms → 2.300ms (33×)
-- Resultado funcional bit a bit idêntico (validado: 337 rows;
-- sum saldo_final / saldo_inicial / peso_total_final / gmd em 4 grupos
-- (faz × cenario) = 20/20 métricas iguais).
--
-- INSERT explícito nas 31 colunas de zoot_mensal_cache para imunidade contra
-- reorder de colunas. Assinaturas, RETURNS, LANGUAGE e SECURITY DEFINER
-- preservados exatamente como antes. Triggers, views e dados não alterados.

-- =========================================================================
-- V1: refresh_zoot_cache(fazenda, ano)
-- Chamada por fn_zoot_cache_rebuild → caminho quente após edição de lançamento.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.refresh_zoot_cache(
  p_fazenda_id uuid,
  p_ano integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.zoot_mensal_cache
   WHERE fazenda_id = p_fazenda_id
     AND ano = p_ano;

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
    fonte_oficial_mes, updated_at, saldo_sistema, saldo_p1
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
    fonte_oficial_mes, now(), saldo_sistema, saldo_p1
  FROM public.fn_zoot_categoria_mensal(p_fazenda_id, p_ano);
END;
$function$;

-- =========================================================================
-- V2: refresh_zoot_cache(fazenda, ano, cenario)
-- Refresh restrito a um cenário ('realizado' | 'meta').
-- =========================================================================
CREATE OR REPLACE FUNCTION public.refresh_zoot_cache(
  p_fazenda_id uuid,
  p_ano integer,
  p_cenario text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.zoot_mensal_cache
   WHERE fazenda_id = p_fazenda_id
     AND ano = p_ano
     AND cenario = p_cenario;

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
    fonte_oficial_mes, updated_at, saldo_sistema, saldo_p1
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
    fonte_oficial_mes, now(), saldo_sistema, saldo_p1
  FROM public.fn_zoot_categoria_mensal(p_fazenda_id, p_ano, p_cenario);
END;
$function$;

-- =========================================================================
-- V3: refresh_zoot_cache(fazenda, ano, mes)
-- Refresh restrito a um mês específico.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.refresh_zoot_cache(
  p_fazenda_id uuid,
  p_ano integer,
  p_mes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.zoot_mensal_cache
   WHERE fazenda_id = p_fazenda_id
     AND ano = p_ano
     AND mes = p_mes;

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
    fonte_oficial_mes, updated_at, saldo_sistema, saldo_p1
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
    fonte_oficial_mes, now(), saldo_sistema, saldo_p1
  FROM public.fn_zoot_categoria_mensal(p_fazenda_id, p_ano)
   WHERE mes = p_mes;
END;
$function$;
