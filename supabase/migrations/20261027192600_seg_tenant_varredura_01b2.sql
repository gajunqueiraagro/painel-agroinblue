-- PR-SEG-TENANT-VARREDURA-01B2 — corpo interno + RPC publica guardada: cache zootecnico e pilares
--
-- POR QUE (P0 de 03/10): `refresh_zoot_cache` (3 assinaturas), `fn_zoot_categoria_mensal`, `get_status_pilares_fechamento` e
-- `can_close_valor_rebanho` sao SECURITY DEFINER com EXECUTE para `authenticated` e SEM guarda de tenant: o gestor de um cliente lia
-- o rebanho por categoria e o status dos pilares de uma fazenda de outro e regravava o cache dela. E elas tambem sao chamadas SEM
-- USUARIO — pelo cron `zoot_cache_sujo_reconstruir`, pelo trigger deferido em `zoot_cache_sujo`, pelos triggers de mes fechado em
-- `lancamentos` e em `valor_rebanho_fechamento` —, entao a guarda nao pode entrar direto no corpo.
--
-- O DESENHO: para cada uma, uma INTERNA `_fn_…` com o corpo de hoje, sem EXECUTE para PUBLIC, anon e authenticated; e a PUBLICA,
-- de mesmo nome, assinatura, retorno e ACL, passa a ser so' a guarda (a fazenda existe e o cliente dela passa em `tenant_ok`,
-- senao 42501 "sem acesso a este registro") e o repasse. Cron, triggers e funcoes internas chamam a interna.
--   internas (6): _fn_refresh_zoot_cache x3 (chamam _fn_zoot_categoria_mensal), _fn_zoot_categoria_mensal,
--                 _fn_status_pilares_fechamento, _fn_can_close_valor_rebanho (chama _fn_status_pilares_fechamento)
--   chamadores que passam a' interna (5): fn_zoot_cache_reconstruir_sujos, trg_fn_zoot_cache_reconstruir, get_status_pilares_ano
--                 (ja' tinha guarda propria; so' troca a chamada), guard_valor_rebanho_requer_p1_fechado (ja' SECURITY DEFINER) e
--                 guard_lancamento_mes_fechado_p1 — que vira SECURITY DEFINER com search_path fixo (decisao do Gabriel): ela so' le'
--                 o status do mes da propria linha (NEW/OLD) e recusa; nao le' nem escreve mais nada.
-- NAO MUDAM: `fn_zoot_cache_rebuild` (tem guarda propria e usuario; segue chamando a publica) e `fn_zoot_cache_ensure`.
-- Os corpos das internas sao os de hoje, byte a byte (as de `fn_zoot_categoria_mensal` e de `get_status_pilares_fechamento` tem o
-- MESMO md5 do corpo de origem; as outras quatro trocam so' o nome da funcao que chamam). Guardado por md5 de origem e de destino.

DO $guarda$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.refresh_zoot_cache(uuid, integer)'::regprocedure, 'c6a682c7b184aeaa8e817e4327d27d4f'),
    ('public.refresh_zoot_cache(uuid, integer, text)'::regprocedure, '40de5b722d211092c0e83dacf5213c20'),
    ('public.refresh_zoot_cache(uuid, integer, integer)'::regprocedure, 'd127294c9dda0f8451ba36a1a17df328'),
    ('public.fn_zoot_categoria_mensal(uuid, integer, text)'::regprocedure, '5358f87341c38385325acfda96e4db8c'),
    ('public.get_status_pilares_fechamento(uuid, text)'::regprocedure, '84f5f2e344741c5a82cbb1b5f556a3d2'),
    ('public.can_close_valor_rebanho(uuid, text)'::regprocedure, 'b5d3ec004850b479be60bbb05e669157'),
    ('public.fn_zoot_cache_reconstruir_sujos()'::regprocedure, '602664a8613c4e5821bb8deec7f2eb69'),
    ('public.trg_fn_zoot_cache_reconstruir()'::regprocedure, 'be6899e0eda64782c0829ff44d107ac5'),
    ('public.get_status_pilares_ano(uuid, integer)'::regprocedure, '46ad7cc4b45e4709c6c978dce03baaed'),
    ('public.guard_valor_rebanho_requer_p1_fechado()'::regprocedure, '96ee64aef196a33aeaee4a7a882d2d23'),
    ('public.guard_lancamento_mes_fechado_p1()'::regprocedure, 'c01f38bc73af3b82aaa2a6074ece781f')
  ) v(f, m) LOOP
    IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = r.f) IS DISTINCT FROM r.m THEN
      RAISE EXCEPTION '%: corpo de origem inesperado. Migration abortada.', r.f::text;
    END IF;
  END LOOP;
  CREATE TEMP TABLE _seg01b2_acl ON COMMIT DROP AS
    SELECT p.oid, p.proacl::text AS acl, p.provolatile AS vol, pg_get_function_result(p.oid) AS res, pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('refresh_zoot_cache', 'fn_zoot_categoria_mensal', 'get_status_pilares_fechamento', 'can_close_valor_rebanho');
END $guarda$;

-- ═══ 1) as internas: o corpo de hoje, sem EXECUTE para quem vem da API ═══
CREATE FUNCTION public._fn_zoot_categoria_mensal(p_fazenda_id uuid, p_ano integer, p_cenario text DEFAULT NULL::text)
 RETURNS TABLE(fazenda_id uuid, cliente_id uuid, ano integer, mes integer, cenario text, ano_mes text, categoria_id uuid, categoria_codigo text, categoria_nome text, ordem_exibicao integer, saldo_inicial integer, entradas_externas integer, saidas_externas integer, evol_cat_entrada integer, evol_cat_saida integer, saldo_final integer, peso_total_inicial numeric, peso_total_final numeric, peso_medio_inicial numeric, peso_medio_final numeric, peso_entradas_externas numeric, peso_saidas_externas numeric, peso_evol_cat_entrada numeric, peso_evol_cat_saida numeric, dias_mes integer, gmd numeric, producao_biologica numeric, fonte_oficial_mes text, saldo_sistema integer, saldo_p1 integer, cab_nascimento numeric, cab_compra numeric, cab_transf_entrada numeric, cab_abate numeric, cab_venda numeric, cab_venda_pe numeric, cab_transf_saida numeric, cab_consumo numeric, cab_morte numeric, peso_nascimento numeric, peso_compra numeric, peso_transf_entrada numeric, peso_abate numeric, peso_venda numeric, peso_venda_pe numeric, peso_transf_saida numeric, peso_consumo numeric, peso_morte numeric, peso_carcaca_abate numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH RECURSIVE
categorias AS (SELECT id, codigo, nome, ordem_exibicao FROM categorias_rebanho),
saldo_ini_cat AS (
  SELECT si.fazenda_id, si.cliente_id, si.ano, cr.id AS categoria_id, cr.codigo, cr.nome AS categoria_nome, cr.ordem_exibicao,
    sum(si.quantidade)::numeric AS cab_ini, sum(si.quantidade::numeric * COALESCE(si.peso_medio_kg, 0)) AS peso_ini
  FROM saldos_iniciais si JOIN categorias cr ON cr.codigo = si.categoria
  WHERE si.fazenda_id = p_fazenda_id AND si.ano = p_ano
  GROUP BY si.fazenda_id, si.cliente_id, si.ano, cr.id, cr.codigo, cr.nome, cr.ordem_exibicao
),
mov_real AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
    sum(CASE WHEN l.tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade ELSE 0 END)::numeric AS ent,
    sum(CASE WHEN l.tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade ELSE 0 END)::numeric AS sai,
    sum(CASE WHEN l.tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS p_ent,
    sum(CASE WHEN l.tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS p_sai,
    sum(CASE WHEN l.tipo = 'nascimento' THEN l.quantidade ELSE 0 END)::numeric AS cab_nascimento,
    sum(CASE WHEN l.tipo = 'compra' THEN l.quantidade ELSE 0 END)::numeric AS cab_compra,
    sum(CASE WHEN l.tipo = 'transferencia_entrada' THEN l.quantidade ELSE 0 END)::numeric AS cab_transf_entrada,
    sum(CASE WHEN l.tipo = 'abate' THEN l.quantidade ELSE 0 END)::numeric AS cab_abate,
    sum(CASE WHEN l.tipo = 'venda' THEN l.quantidade ELSE 0 END)::numeric AS cab_venda,
    sum(CASE WHEN l.tipo = 'venda_pe' THEN l.quantidade ELSE 0 END)::numeric AS cab_venda_pe,
    sum(CASE WHEN l.tipo = 'transferencia_saida' THEN l.quantidade ELSE 0 END)::numeric AS cab_transf_saida,
    sum(CASE WHEN l.tipo = 'consumo' THEN l.quantidade ELSE 0 END)::numeric AS cab_consumo,
    sum(CASE WHEN l.tipo = 'morte' THEN l.quantidade ELSE 0 END)::numeric AS cab_morte,
    sum(CASE WHEN l.tipo = 'nascimento' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_nascimento,
    sum(CASE WHEN l.tipo = 'compra' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_compra,
    sum(CASE WHEN l.tipo = 'transferencia_entrada' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_transf_entrada,
    sum(CASE WHEN l.tipo = 'abate' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_abate,
    sum(CASE WHEN l.tipo = 'venda' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_venda,
    sum(CASE WHEN l.tipo = 'venda_pe' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_venda_pe,
    sum(CASE WHEN l.tipo = 'transferencia_saida' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_transf_saida,
    sum(CASE WHEN l.tipo = 'consumo' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_consumo,
    sum(CASE WHEN l.tipo = 'morte' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_morte,
    /* SEM fallback para peso_medio_kg: carcaca ausente e AUSENCIA. O
       calcArrobas (economicos.ts:37) devolve null nesse caso, com a razao
       escrita — "o rendimento de carcaca e fundamental". Zero e o valor
       certo no agregado; fallback seria inventar carcaca. */
    sum(CASE WHEN l.tipo = 'abate' THEN l.quantidade::numeric * COALESCE(l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_carcaca_abate
  FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
    AND l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
),
rcl_sai_real AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
    sum(l.quantidade)::numeric AS qtd, sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
    AND l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL
    AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
),
rcl_ent_real AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
    sum(l.quantidade)::numeric AS qtd, sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria_destino
  WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
    AND l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL
    AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
),
mov_meta AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
    sum(CASE WHEN l.tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade ELSE 0 END)::numeric AS ent,
    sum(CASE WHEN l.tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade ELSE 0 END)::numeric AS sai,
    sum(CASE WHEN l.tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS p_ent,
    sum(CASE WHEN l.tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS p_sai,
    sum(CASE WHEN l.tipo = 'nascimento' THEN l.quantidade ELSE 0 END)::numeric AS cab_nascimento,
    sum(CASE WHEN l.tipo = 'compra' THEN l.quantidade ELSE 0 END)::numeric AS cab_compra,
    sum(CASE WHEN l.tipo = 'transferencia_entrada' THEN l.quantidade ELSE 0 END)::numeric AS cab_transf_entrada,
    sum(CASE WHEN l.tipo = 'abate' THEN l.quantidade ELSE 0 END)::numeric AS cab_abate,
    sum(CASE WHEN l.tipo = 'venda' THEN l.quantidade ELSE 0 END)::numeric AS cab_venda,
    sum(CASE WHEN l.tipo = 'venda_pe' THEN l.quantidade ELSE 0 END)::numeric AS cab_venda_pe,
    sum(CASE WHEN l.tipo = 'transferencia_saida' THEN l.quantidade ELSE 0 END)::numeric AS cab_transf_saida,
    sum(CASE WHEN l.tipo = 'consumo' THEN l.quantidade ELSE 0 END)::numeric AS cab_consumo,
    sum(CASE WHEN l.tipo = 'morte' THEN l.quantidade ELSE 0 END)::numeric AS cab_morte,
    sum(CASE WHEN l.tipo = 'nascimento' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_nascimento,
    sum(CASE WHEN l.tipo = 'compra' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_compra,
    sum(CASE WHEN l.tipo = 'transferencia_entrada' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_transf_entrada,
    sum(CASE WHEN l.tipo = 'abate' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_abate,
    sum(CASE WHEN l.tipo = 'venda' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_venda,
    sum(CASE WHEN l.tipo = 'venda_pe' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_venda_pe,
    sum(CASE WHEN l.tipo = 'transferencia_saida' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_transf_saida,
    sum(CASE WHEN l.tipo = 'consumo' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_consumo,
    sum(CASE WHEN l.tipo = 'morte' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_morte,
    /* SEM fallback para peso_medio_kg: carcaca ausente e AUSENCIA. O
       calcArrobas (economicos.ts:37) devolve null nesse caso, com a razao
       escrita — "o rendimento de carcaca e fundamental". Zero e o valor
       certo no agregado; fallback seria inventar carcaca. */
    sum(CASE WHEN l.tipo = 'abate' THEN l.quantidade::numeric * COALESCE(l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_carcaca_abate
  FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
    AND l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'meta'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
),
rcl_sai_meta AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
    sum(l.quantidade)::numeric AS qtd, sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
    AND l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'meta'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
),
rcl_ent_meta AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
    sum(l.quantidade)::numeric AS qtd, sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria_destino
  WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
    AND l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'meta'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
),
mov_all AS (
  SELECT COALESCE(m.fazenda_id,re.fazenda_id,rs.fazenda_id) AS fazenda_id, COALESCE(m.cliente_id,re.cliente_id,rs.cliente_id) AS cliente_id,
    COALESCE(m.categoria_id,re.categoria_id,rs.categoria_id) AS categoria_id,
    COALESCE(m.ano,re.ano,rs.ano) AS ano, COALESCE(m.mes,re.mes,rs.mes) AS mes,
    COALESCE(m.ent,0) AS ent, COALESCE(m.sai,0) AS sai,
    COALESCE(re.qtd,0) AS evol_ent, COALESCE(rs.qtd,0) AS evol_sai,
    COALESCE(m.p_ent,0) AS p_ent, COALESCE(m.p_sai,0) AS p_sai,
    COALESCE(re.peso,0) AS p_evol_ent, COALESCE(rs.peso,0) AS p_evol_sai,
    COALESCE(m.cab_nascimento,0) AS cab_nascimento,
    COALESCE(m.cab_compra,0) AS cab_compra,
    COALESCE(m.cab_transf_entrada,0) AS cab_transf_entrada,
    COALESCE(m.cab_abate,0) AS cab_abate,
    COALESCE(m.cab_venda,0) AS cab_venda,
    COALESCE(m.cab_venda_pe,0) AS cab_venda_pe,
    COALESCE(m.cab_transf_saida,0) AS cab_transf_saida,
    COALESCE(m.cab_consumo,0) AS cab_consumo,
    COALESCE(m.cab_morte,0) AS cab_morte,
    COALESCE(m.peso_nascimento,0) AS peso_nascimento,
    COALESCE(m.peso_compra,0) AS peso_compra,
    COALESCE(m.peso_transf_entrada,0) AS peso_transf_entrada,
    COALESCE(m.peso_abate,0) AS peso_abate,
    COALESCE(m.peso_venda,0) AS peso_venda,
    COALESCE(m.peso_venda_pe,0) AS peso_venda_pe,
    COALESCE(m.peso_transf_saida,0) AS peso_transf_saida,
    COALESCE(m.peso_consumo,0) AS peso_consumo,
    COALESCE(m.peso_morte,0) AS peso_morte,
    COALESCE(m.peso_carcaca_abate,0) AS peso_carcaca_abate,
    'realizado'::text AS cenario
  FROM mov_real m
  FULL JOIN rcl_ent_real re ON re.fazenda_id=m.fazenda_id AND re.categoria_id=m.categoria_id AND re.ano=m.ano AND re.mes=m.mes
  FULL JOIN rcl_sai_real rs ON rs.fazenda_id=COALESCE(m.fazenda_id,re.fazenda_id) AND rs.categoria_id=COALESCE(m.categoria_id,re.categoria_id) AND rs.ano=COALESCE(m.ano,re.ano) AND rs.mes=COALESCE(m.mes,re.mes)
  UNION ALL
  SELECT COALESCE(m.fazenda_id,re.fazenda_id,rs.fazenda_id), COALESCE(m.cliente_id,re.cliente_id,rs.cliente_id),
    COALESCE(m.categoria_id,re.categoria_id,rs.categoria_id),
    COALESCE(m.ano,re.ano,rs.ano), COALESCE(m.mes,re.mes,rs.mes),
    COALESCE(m.ent,0), COALESCE(m.sai,0), COALESCE(re.qtd,0), COALESCE(rs.qtd,0),
    COALESCE(m.p_ent,0), COALESCE(m.p_sai,0), COALESCE(re.peso,0), COALESCE(rs.peso,0),
    COALESCE(m.cab_nascimento,0),
    COALESCE(m.cab_compra,0),
    COALESCE(m.cab_transf_entrada,0),
    COALESCE(m.cab_abate,0),
    COALESCE(m.cab_venda,0),
    COALESCE(m.cab_venda_pe,0),
    COALESCE(m.cab_transf_saida,0),
    COALESCE(m.cab_consumo,0),
    COALESCE(m.cab_morte,0),
    COALESCE(m.peso_nascimento,0),
    COALESCE(m.peso_compra,0),
    COALESCE(m.peso_transf_entrada,0),
    COALESCE(m.peso_abate,0),
    COALESCE(m.peso_venda,0),
    COALESCE(m.peso_venda_pe,0),
    COALESCE(m.peso_transf_saida,0),
    COALESCE(m.peso_consumo,0),
    COALESCE(m.peso_morte,0),
    COALESCE(m.peso_carcaca_abate,0),
    'meta'::text
  FROM mov_meta m
  FULL JOIN rcl_ent_meta re ON re.fazenda_id=m.fazenda_id AND re.categoria_id=m.categoria_id AND re.ano=m.ano AND re.mes=m.mes
  FULL JOIN rcl_sai_meta rs ON rs.fazenda_id=COALESCE(m.fazenda_id,re.fazenda_id) AND rs.categoria_id=COALESCE(m.categoria_id,re.categoria_id) AND rs.ano=COALESCE(m.ano,re.ano) AND rs.mes=COALESCE(m.mes,re.mes)
),
all_cat_bases AS (
  SELECT p_fazenda_id AS fazenda_id,
    COALESCE(si.cliente_id, (SELECT f.cliente_id FROM fazendas f WHERE f.id = p_fazenda_id LIMIT 1)) AS cliente_id,
    p_ano AS ano, cr.id AS categoria_id, scen.cenario, cr.codigo, cr.nome AS categoria_nome, cr.ordem_exibicao,
    COALESCE(si.cab_ini, 0) AS cab_ini_ano, COALESCE(si.peso_ini, 0) AS peso_ini_ano
  FROM categorias cr
  CROSS JOIN (VALUES ('realizado'::text), ('meta'::text)) AS scen(cenario)
  LEFT JOIN saldo_ini_cat si ON si.categoria_id = cr.id
  WHERE cr.id IN (SELECT categoria_id FROM mov_all UNION ALL SELECT categoria_id FROM saldo_ini_cat)
),
expanded AS (
  SELECT acb.fazenda_id, acb.cliente_id, acb.categoria_id, acb.codigo, acb.categoria_nome, acb.ordem_exibicao,
    acb.ano, m.mes, m.mes AS seq, acb.cenario, acb.cab_ini_ano, acb.peso_ini_ano,
    COALESCE(ma.ent,0) AS ent, COALESCE(ma.sai,0) AS sai,
    COALESCE(ma.evol_ent,0) AS evol_ent, COALESCE(ma.evol_sai,0) AS evol_sai,
    COALESCE(ma.p_ent,0) AS p_ent, COALESCE(ma.p_sai,0) AS p_sai,
    COALESCE(ma.p_evol_ent,0) AS p_evol_ent, COALESCE(ma.p_evol_sai,0) AS p_evol_sai,
    COALESCE(ma.cab_nascimento,0) AS cab_nascimento,
    COALESCE(ma.cab_compra,0) AS cab_compra,
    COALESCE(ma.cab_transf_entrada,0) AS cab_transf_entrada,
    COALESCE(ma.cab_abate,0) AS cab_abate,
    COALESCE(ma.cab_venda,0) AS cab_venda,
    COALESCE(ma.cab_venda_pe,0) AS cab_venda_pe,
    COALESCE(ma.cab_transf_saida,0) AS cab_transf_saida,
    COALESCE(ma.cab_consumo,0) AS cab_consumo,
    COALESCE(ma.cab_morte,0) AS cab_morte,
    COALESCE(ma.peso_nascimento,0) AS peso_nascimento,
    COALESCE(ma.peso_compra,0) AS peso_compra,
    COALESCE(ma.peso_transf_entrada,0) AS peso_transf_entrada,
    COALESCE(ma.peso_abate,0) AS peso_abate,
    COALESCE(ma.peso_venda,0) AS peso_venda,
    COALESCE(ma.peso_venda_pe,0) AS peso_venda_pe,
    COALESCE(ma.peso_transf_saida,0) AS peso_transf_saida,
    COALESCE(ma.peso_consumo,0) AS peso_consumo,
    COALESCE(ma.peso_morte,0) AS peso_morte,
    COALESCE(ma.peso_carcaca_abate,0) AS peso_carcaca_abate,
    date_part('day', date_trunc('month', make_date(acb.ano, m.mes, 1)::timestamp) + '1 mon -1 days'::interval)::integer AS dias_mes,
    CASE WHEN acb.cenario = 'realizado' THEN fp.saldo_final ELSE NULL END AS fp_saldo_final,
    CASE WHEN acb.cenario = 'realizado' THEN fp.peso_total_final ELSE NULL END AS fp_peso_total_final,
    CASE WHEN acb.cenario = 'realizado' AND fp.saldo_final IS NOT NULL THEN 'fechamento' ELSE NULL END AS fonte_mes
  FROM all_cat_bases acb
  JOIN LATERAL generate_series(1, 12) m(mes) ON true
  LEFT JOIN mov_all ma ON ma.fazenda_id=acb.fazenda_id AND ma.categoria_id=acb.categoria_id AND ma.ano=acb.ano AND ma.mes=m.mes AND ma.cenario=acb.cenario
  LEFT JOIN LATERAL (
    SELECT sum(fpi.quantidade) AS saldo_final, sum(fpi.peso_total) AS peso_total_final
    FROM fechamento_pastos fp2
    JOIN public.pastos p2 ON p2.id = fp2.pasto_id
    JOIN fechamento_pasto_itens fpi ON fpi.fechamento_id = fp2.id
    WHERE fp2.fazenda_id = acb.fazenda_id AND fp2.status = 'fechado'
      AND EXTRACT(year FROM (fp2.ano_mes||'-01')::date)::integer = acb.ano
      AND EXTRACT(month FROM (fp2.ano_mes||'-01')::date)::integer = m.mes
      AND fpi.categoria_id = acb.categoria_id
      AND (public.fn_pasto_vigente_no_mes(p2.ativo, p2.data_inicio, p2.data_fim, fp2.ano_mes)
           OR NOT EXISTS (SELECT 1 FROM fechamento_pastos fpv
                           JOIN public.pastos pv ON pv.id = fpv.pasto_id
                          WHERE fpv.fazenda_id = fp2.fazenda_id AND fpv.ano_mes = fp2.ano_mes
                            AND fpv.status = 'fechado'
                            AND public.fn_pasto_vigente_no_mes(pv.ativo, pv.data_inicio, pv.data_fim, fpv.ano_mes)))
    GROUP BY fpi.categoria_id
  ) fp ON acb.cenario = 'realizado'
),
chain AS (
  SELECT e.fazenda_id, e.cliente_id, e.categoria_id, e.codigo, e.categoria_nome, e.ordem_exibicao,
    e.ano, e.mes, e.seq, e.cenario, e.dias_mes, e.fonte_mes,
    e.ent, e.sai, e.evol_ent, e.evol_sai, e.p_ent, e.p_sai, e.p_evol_ent, e.p_evol_sai,
    e.cab_nascimento,
    e.cab_compra,
    e.cab_transf_entrada,
    e.cab_abate,
    e.cab_venda,
    e.cab_venda_pe,
    e.cab_transf_saida,
    e.cab_consumo,
    e.cab_morte,
    e.peso_nascimento,
    e.peso_compra,
    e.peso_transf_entrada,
    e.peso_abate,
    e.peso_venda,
    e.peso_venda_pe,
    e.peso_transf_saida,
    e.peso_consumo,
    e.peso_morte,
    e.peso_carcaca_abate,
    e.cab_ini_ano, e.peso_ini_ano,
    e.cab_ini_ano AS saldo_ini_calc, e.peso_ini_ano AS peso_ini_calc,
    COALESCE(e.fp_saldo_final::numeric, e.cab_ini_ano + e.ent - e.sai + e.evol_ent - e.evol_sai) AS saldo_fin_calc,
    COALESCE(e.fp_peso_total_final, e.peso_ini_ano + e.p_ent - e.p_sai + e.p_evol_ent - e.p_evol_sai) AS peso_fin_calc,
    e.cab_ini_ano AS saldo_ini_sistema,
    (e.cab_ini_ano + e.ent - e.sai + e.evol_ent - e.evol_sai) AS saldo_fin_sistema,
    e.fp_saldo_final AS fp_sf
  FROM expanded e WHERE e.mes = 1
  UNION ALL
  SELECT e.fazenda_id, e.cliente_id, e.categoria_id, e.codigo, e.categoria_nome, e.ordem_exibicao,
    e.ano, e.mes, e.seq, e.cenario, e.dias_mes, e.fonte_mes,
    e.ent, e.sai, e.evol_ent, e.evol_sai, e.p_ent, e.p_sai, e.p_evol_ent, e.p_evol_sai,
    e.cab_nascimento,
    e.cab_compra,
    e.cab_transf_entrada,
    e.cab_abate,
    e.cab_venda,
    e.cab_venda_pe,
    e.cab_transf_saida,
    e.cab_consumo,
    e.cab_morte,
    e.peso_nascimento,
    e.peso_compra,
    e.peso_transf_entrada,
    e.peso_abate,
    e.peso_venda,
    e.peso_venda_pe,
    e.peso_transf_saida,
    e.peso_consumo,
    e.peso_morte,
    e.peso_carcaca_abate,
    e.cab_ini_ano, e.peso_ini_ano,
    c.saldo_fin_calc AS saldo_ini_calc, c.peso_fin_calc AS peso_ini_calc,
    COALESCE(e.fp_saldo_final::numeric, c.saldo_fin_calc + e.ent - e.sai + e.evol_ent - e.evol_sai) AS saldo_fin_calc,
    COALESCE(e.fp_peso_total_final, c.peso_fin_calc + e.p_ent - e.p_sai + e.p_evol_ent - e.p_evol_sai) AS peso_fin_calc,
    c.saldo_fin_sistema AS saldo_ini_sistema,
    (c.saldo_fin_sistema + e.ent - e.sai + e.evol_ent - e.evol_sai) AS saldo_fin_sistema,
    e.fp_saldo_final AS fp_sf
  FROM chain c JOIN expanded e
    ON e.fazenda_id=c.fazenda_id AND e.cenario=c.cenario
    AND e.categoria_id=c.categoria_id AND e.ano=c.ano AND e.seq=(c.seq+1)
)
SELECT fazenda_id, cliente_id, ano, mes, cenario,
  (ano::text||'-')||lpad(mes::text,2,'0') AS ano_mes,
  categoria_id, codigo AS categoria_codigo, categoria_nome, ordem_exibicao,
  saldo_ini_calc::integer AS saldo_inicial,
  ent::integer AS entradas_externas, sai::integer AS saidas_externas,
  evol_ent::integer AS evol_cat_entrada, evol_sai::integer AS evol_cat_saida,
  saldo_fin_calc::integer AS saldo_final,
  round(peso_ini_calc,2) AS peso_total_inicial, round(peso_fin_calc,2) AS peso_total_final,
  CASE WHEN saldo_ini_calc>0 THEN round(peso_ini_calc/saldo_ini_calc,2) ELSE NULL END AS peso_medio_inicial,
  CASE WHEN saldo_fin_calc>0 THEN round(peso_fin_calc/saldo_fin_calc,2) ELSE NULL END AS peso_medio_final,
  round(p_ent,2) AS peso_entradas_externas, round(p_sai,2) AS peso_saidas_externas,
  round(p_evol_ent,2) AS peso_evol_cat_entrada, round(p_evol_sai,2) AS peso_evol_cat_saida,
  dias_mes,
  CASE WHEN ((saldo_ini_calc+saldo_fin_calc)/2.0)>0 AND dias_mes>0
    THEN round((peso_fin_calc-peso_ini_calc-p_ent+p_sai-p_evol_ent+p_evol_sai)/((saldo_ini_calc+saldo_fin_calc)/2.0*dias_mes),4)
    ELSE NULL END AS gmd,
  round(peso_fin_calc-peso_ini_calc-p_ent+p_sai-p_evol_ent+p_evol_sai,2) AS producao_biologica,
  fonte_mes AS fonte_oficial_mes,
  saldo_fin_sistema::integer AS saldo_sistema,
  CASE WHEN fonte_mes = 'fechamento' THEN fp_sf::integer ELSE NULL END AS saldo_p1,
  cab_nascimento AS cab_nascimento,
  cab_compra AS cab_compra,
  cab_transf_entrada AS cab_transf_entrada,
  cab_abate AS cab_abate,
  cab_venda AS cab_venda,
  cab_venda_pe AS cab_venda_pe,
  cab_transf_saida AS cab_transf_saida,
  cab_consumo AS cab_consumo,
  cab_morte AS cab_morte,
  round(peso_nascimento,2) AS peso_nascimento,
  round(peso_compra,2) AS peso_compra,
  round(peso_transf_entrada,2) AS peso_transf_entrada,
  round(peso_abate,2) AS peso_abate,
  round(peso_venda,2) AS peso_venda,
  round(peso_venda_pe,2) AS peso_venda_pe,
  round(peso_transf_saida,2) AS peso_transf_saida,
  round(peso_consumo,2) AS peso_consumo,
  round(peso_morte,2) AS peso_morte,
  round(peso_carcaca_abate,2) AS peso_carcaca_abate
FROM chain
WHERE (p_cenario IS NULL OR cenario = p_cenario)
  AND NOT (saldo_ini_calc=0 AND saldo_fin_calc=0 AND ent=0 AND sai=0 AND evol_ent=0 AND evol_sai=0)
$function$;
REVOKE ALL ON FUNCTION public._fn_zoot_categoria_mensal(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_zoot_categoria_mensal(uuid, integer, text) TO service_role;

CREATE FUNCTION public._fn_status_pilares_fechamento(_fazenda_id uuid, _ano_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    DECLARE
      _cards_no_mes    int;
      _total_pastos    int;
      _pastos_fechados int;
      _pastos_pecuaria int;
      _p1_status       text;
      _p2_status       text;
      _mes_ini         date;
      _mes_fim         date;
    BEGIN
      _mes_ini := to_date(_ano_mes || '-01', 'YYYY-MM-DD');
      _mes_fim := (_mes_ini + interval '1 month - 1 day')::date;

      SELECT count(*)
        INTO _cards_no_mes
        FROM fechamento_pastos
       WHERE fazenda_id = _fazenda_id
         AND ano_mes    = _ano_mes;

      SELECT
        count(*),
        count(*) FILTER (WHERE fp.status = 'fechado')
      INTO _total_pastos, _pastos_fechados
      FROM fechamento_pastos fp
      JOIN pastos p ON p.id = fp.pasto_id
      WHERE fp.fazenda_id = _fazenda_id
        AND fp.ano_mes    = _ano_mes
        AND p.ativo
        AND p.tipo_uso IS DISTINCT FROM 'divergencia'
        AND (p.data_inicio IS NULL OR p.data_inicio <= _mes_fim)
        AND (p.data_fim    IS NULL OR p.data_fim    >= _mes_ini);

      IF _cards_no_mes = 0 THEN
        _p1_status := 'nao_iniciado';
      ELSIF _total_pastos > 0 AND _pastos_fechados = _total_pastos THEN
        _p1_status := 'oficial';
      ELSE
        _p1_status := 'pendente';
      END IF;

      SELECT count(*)
        INTO _pastos_pecuaria
        FROM fechamento_pastos fp
        JOIN pastos p ON p.id = fp.pasto_id
       WHERE fp.fazenda_id = _fazenda_id
         AND fp.ano_mes    = _ano_mes
         AND p.ativo
         AND coalesce(fp.tipo_uso_mes, p.tipo_uso) IN ('cria','recria','engorda');

      IF _cards_no_mes = 0 THEN
        _p2_status := 'nao_iniciado';
      ELSIF EXISTS (
        SELECT 1 FROM valor_rebanho_fechamento
         WHERE fazenda_id = _fazenda_id
           AND ano_mes    = _ano_mes
           AND status     = 'fechado'
      ) THEN
        _p2_status := 'oficial';
      ELSIF _pastos_pecuaria = 0 THEN
        _p2_status := 'nao_aplicavel';
      ELSE
        _p2_status := 'pendente';
      END IF;

      RETURN jsonb_build_object(
        'fazenda_id',               _fazenda_id,
        'ano_mes',                  _ano_mes,
        'p1_mapa_pastos',           jsonb_build_object('status', _p1_status),
        'p2_valor_rebanho',         jsonb_build_object('status', _p2_status),
        'p3_financeiro_caixa',      jsonb_build_object('status', 'nao_implementado'),
        'p4_competencia',           jsonb_build_object('status', 'nao_implementado'),
        'p5_economico_consolidado', jsonb_build_object('status', 'nao_implementado')
      );
    END;
    $function$;
REVOKE ALL ON FUNCTION public._fn_status_pilares_fechamento(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_status_pilares_fechamento(uuid, text) TO service_role;

CREATE FUNCTION public._fn_refresh_zoot_cache(p_fazenda_id uuid, p_ano integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  -- ZOOT-CACHE-BURACO-01: duas chamadas ao mesmo (fazenda, ano) se enfileiram; a segunda ja' ve as linhas da primeira.
  PERFORM pg_advisory_xact_lock(hashtextextended('zoot_mensal_cache:' || p_fazenda_id::text || ':' || p_ano::text, 0));
  DELETE FROM public.zoot_mensal_cache WHERE fazenda_id = p_fazenda_id AND ano = p_ano;
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
    fonte_oficial_mes, updated_at, saldo_sistema, saldo_p1,
    cab_nascimento, cab_compra, cab_transf_entrada,
    cab_abate, cab_venda, cab_venda_pe,
    cab_transf_saida, cab_consumo, cab_morte,
    peso_nascimento, peso_compra, peso_transf_entrada,
    peso_abate, peso_venda, peso_venda_pe,
    peso_transf_saida, peso_consumo, peso_morte,
    peso_carcaca_abate
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
    fonte_oficial_mes, now(), saldo_sistema, saldo_p1,
    cab_nascimento, cab_compra, cab_transf_entrada,
    cab_abate, cab_venda, cab_venda_pe,
    cab_transf_saida, cab_consumo, cab_morte,
    peso_nascimento, peso_compra, peso_transf_entrada,
    peso_abate, peso_venda, peso_venda_pe,
    peso_transf_saida, peso_consumo, peso_morte,
    peso_carcaca_abate
  FROM public._fn_zoot_categoria_mensal(p_fazenda_id, p_ano);
END;
$function$;
REVOKE ALL ON FUNCTION public._fn_refresh_zoot_cache(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_refresh_zoot_cache(uuid, integer) TO service_role;

CREATE FUNCTION public._fn_refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_cenario text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  DELETE FROM public.zoot_mensal_cache WHERE fazenda_id = p_fazenda_id AND ano = p_ano AND cenario = p_cenario;
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
    fonte_oficial_mes, updated_at, saldo_sistema, saldo_p1,
    cab_nascimento, cab_compra, cab_transf_entrada,
    cab_abate, cab_venda, cab_venda_pe,
    cab_transf_saida, cab_consumo, cab_morte,
    peso_nascimento, peso_compra, peso_transf_entrada,
    peso_abate, peso_venda, peso_venda_pe,
    peso_transf_saida, peso_consumo, peso_morte,
    peso_carcaca_abate
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
    fonte_oficial_mes, now(), saldo_sistema, saldo_p1,
    cab_nascimento, cab_compra, cab_transf_entrada,
    cab_abate, cab_venda, cab_venda_pe,
    cab_transf_saida, cab_consumo, cab_morte,
    peso_nascimento, peso_compra, peso_transf_entrada,
    peso_abate, peso_venda, peso_venda_pe,
    peso_transf_saida, peso_consumo, peso_morte,
    peso_carcaca_abate
  FROM public._fn_zoot_categoria_mensal(p_fazenda_id, p_ano, p_cenario);
END;
$function$;
REVOKE ALL ON FUNCTION public._fn_refresh_zoot_cache(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_refresh_zoot_cache(uuid, integer, text) TO service_role;

CREATE FUNCTION public._fn_refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_mes integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  DELETE FROM public.zoot_mensal_cache WHERE fazenda_id = p_fazenda_id AND ano = p_ano AND mes = p_mes;
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
    fonte_oficial_mes, updated_at, saldo_sistema, saldo_p1,
    cab_nascimento, cab_compra, cab_transf_entrada,
    cab_abate, cab_venda, cab_venda_pe,
    cab_transf_saida, cab_consumo, cab_morte,
    peso_nascimento, peso_compra, peso_transf_entrada,
    peso_abate, peso_venda, peso_venda_pe,
    peso_transf_saida, peso_consumo, peso_morte,
    peso_carcaca_abate
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
    fonte_oficial_mes, now(), saldo_sistema, saldo_p1,
    cab_nascimento, cab_compra, cab_transf_entrada,
    cab_abate, cab_venda, cab_venda_pe,
    cab_transf_saida, cab_consumo, cab_morte,
    peso_nascimento, peso_compra, peso_transf_entrada,
    peso_abate, peso_venda, peso_venda_pe,
    peso_transf_saida, peso_consumo, peso_morte,
    peso_carcaca_abate
  FROM public._fn_zoot_categoria_mensal(p_fazenda_id, p_ano)
   WHERE mes = p_mes;
END;
$function$;
REVOKE ALL ON FUNCTION public._fn_refresh_zoot_cache(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_refresh_zoot_cache(uuid, integer, integer) TO service_role;

CREATE FUNCTION public._fn_can_close_valor_rebanho(_fazenda_id uuid, _ano_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pilares jsonb;
  _p1_status text;
BEGIN
  _pilares := public._fn_status_pilares_fechamento(_fazenda_id, _ano_mes);
  _p1_status := _pilares->'p1_mapa_pastos'->>'status';
  IF _p1_status = 'oficial' THEN
    RETURN jsonb_build_object('pode_fechar', true, 'p1_status', _p1_status);
  END IF;
  RETURN jsonb_build_object(
    'pode_fechar', false,
    'p1_status', _p1_status,
    'motivo', 'P1 nao esta oficial: ' || COALESCE(_p1_status, 'null')
  );
END;
$function$;
REVOKE ALL ON FUNCTION public._fn_can_close_valor_rebanho(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_can_close_valor_rebanho(uuid, text) TO service_role;

-- ═══ 2) as publicas: a guarda e o repasse (mesmo nome, assinatura, retorno e ACL) ═══
CREATE OR REPLACE FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_cli uuid := (SELECT f.cliente_id FROM public.fazendas f WHERE f.id = p_fazenda_id);
BEGIN
  -- PR-SEG-TENANT-VARREDURA-01B2: so' a guarda e o repasse. O corpo de antes mora na interna (sem EXECUTE para `authenticated`),
  -- que e' a que o cron, os triggers e as funcoes internas chamam. A fazenda tem de existir e o cliente dela passar em tenant_ok
  -- (admin AgroinBlue ou membro ativo; sem usuario, falso). A recusa e' uma so' e nao diz se a fazenda existe.
  IF v_cli IS NULL OR NOT COALESCE(public.tenant_ok(v_cli), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  PERFORM public._fn_refresh_zoot_cache(p_fazenda_id, p_ano);
END
$function$;

CREATE OR REPLACE FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_cenario text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_cli uuid := (SELECT f.cliente_id FROM public.fazendas f WHERE f.id = p_fazenda_id);
BEGIN
  -- PR-SEG-TENANT-VARREDURA-01B2: so' a guarda e o repasse. O corpo de antes mora na interna (sem EXECUTE para `authenticated`),
  -- que e' a que o cron, os triggers e as funcoes internas chamam. A fazenda tem de existir e o cliente dela passar em tenant_ok
  -- (admin AgroinBlue ou membro ativo; sem usuario, falso). A recusa e' uma so' e nao diz se a fazenda existe.
  IF v_cli IS NULL OR NOT COALESCE(public.tenant_ok(v_cli), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  PERFORM public._fn_refresh_zoot_cache(p_fazenda_id, p_ano, p_cenario);
END
$function$;

CREATE OR REPLACE FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_mes integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_cli uuid := (SELECT f.cliente_id FROM public.fazendas f WHERE f.id = p_fazenda_id);
BEGIN
  -- PR-SEG-TENANT-VARREDURA-01B2: so' a guarda e o repasse. O corpo de antes mora na interna (sem EXECUTE para `authenticated`),
  -- que e' a que o cron, os triggers e as funcoes internas chamam. A fazenda tem de existir e o cliente dela passar em tenant_ok
  -- (admin AgroinBlue ou membro ativo; sem usuario, falso). A recusa e' uma so' e nao diz se a fazenda existe.
  IF v_cli IS NULL OR NOT COALESCE(public.tenant_ok(v_cli), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  PERFORM public._fn_refresh_zoot_cache(p_fazenda_id, p_ano, p_mes);
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_zoot_categoria_mensal(p_fazenda_id uuid, p_ano integer, p_cenario text DEFAULT NULL::text)
 RETURNS TABLE(fazenda_id uuid, cliente_id uuid, ano integer, mes integer, cenario text, ano_mes text, categoria_id uuid, categoria_codigo text, categoria_nome text, ordem_exibicao integer, saldo_inicial integer, entradas_externas integer, saidas_externas integer, evol_cat_entrada integer, evol_cat_saida integer, saldo_final integer, peso_total_inicial numeric, peso_total_final numeric, peso_medio_inicial numeric, peso_medio_final numeric, peso_entradas_externas numeric, peso_saidas_externas numeric, peso_evol_cat_entrada numeric, peso_evol_cat_saida numeric, dias_mes integer, gmd numeric, producao_biologica numeric, fonte_oficial_mes text, saldo_sistema integer, saldo_p1 integer, cab_nascimento numeric, cab_compra numeric, cab_transf_entrada numeric, cab_abate numeric, cab_venda numeric, cab_venda_pe numeric, cab_transf_saida numeric, cab_consumo numeric, cab_morte numeric, peso_nascimento numeric, peso_compra numeric, peso_transf_entrada numeric, peso_abate numeric, peso_venda numeric, peso_venda_pe numeric, peso_transf_saida numeric, peso_consumo numeric, peso_morte numeric, peso_carcaca_abate numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cli uuid := (SELECT f.cliente_id FROM public.fazendas f WHERE f.id = p_fazenda_id);
BEGIN
  -- PR-SEG-TENANT-VARREDURA-01B2: so' a guarda e o repasse. O corpo de antes mora na interna (sem EXECUTE para `authenticated`),
  -- que e' a que o cron, os triggers e as funcoes internas chamam. A fazenda tem de existir e o cliente dela passar em tenant_ok
  -- (admin AgroinBlue ou membro ativo; sem usuario, falso). A recusa e' uma so' e nao diz se a fazenda existe.
  IF v_cli IS NULL OR NOT COALESCE(public.tenant_ok(v_cli), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public._fn_zoot_categoria_mensal(p_fazenda_id, p_ano, p_cenario);
END
$function$;

CREATE OR REPLACE FUNCTION public.get_status_pilares_fechamento(_fazenda_id uuid, _ano_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cli uuid := (SELECT f.cliente_id FROM public.fazendas f WHERE f.id = _fazenda_id);
BEGIN
  -- PR-SEG-TENANT-VARREDURA-01B2: so' a guarda e o repasse. O corpo de antes mora na interna (sem EXECUTE para `authenticated`),
  -- que e' a que o cron, os triggers e as funcoes internas chamam. A fazenda tem de existir e o cliente dela passar em tenant_ok
  -- (admin AgroinBlue ou membro ativo; sem usuario, falso). A recusa e' uma so' e nao diz se a fazenda existe.
  IF v_cli IS NULL OR NOT COALESCE(public.tenant_ok(v_cli), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  RETURN public._fn_status_pilares_fechamento(_fazenda_id, _ano_mes);
END
$function$;

CREATE OR REPLACE FUNCTION public.can_close_valor_rebanho(_fazenda_id uuid, _ano_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cli uuid := (SELECT f.cliente_id FROM public.fazendas f WHERE f.id = _fazenda_id);
BEGIN
  -- PR-SEG-TENANT-VARREDURA-01B2: so' a guarda e o repasse. O corpo de antes mora na interna (sem EXECUTE para `authenticated`),
  -- que e' a que o cron, os triggers e as funcoes internas chamam. A fazenda tem de existir e o cliente dela passar em tenant_ok
  -- (admin AgroinBlue ou membro ativo; sem usuario, falso). A recusa e' uma so' e nao diz se a fazenda existe.
  IF v_cli IS NULL OR NOT COALESCE(public.tenant_ok(v_cli), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  RETURN public._fn_can_close_valor_rebanho(_fazenda_id, _ano_mes);
END
$function$;

-- ═══ 3) quem roda sem usuario chama a interna ═══
CREATE OR REPLACE FUNCTION public.fn_zoot_cache_reconstruir_sujos()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT fazenda_id, ano FROM public.zoot_cache_sujo ORDER BY marcado_em LOOP
    BEGIN
      PERFORM public._fn_refresh_zoot_cache(r.fazenda_id, r.ano);
      DELETE FROM public.zoot_cache_sujo WHERE fazenda_id = r.fazenda_id AND ano = r.ano;
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'ZOOT-CACHE-BURACO-01: varredura nao reconstruiu (%, %): %', r.fazenda_id, r.ano, SQLERRM;
    END;
  END LOOP;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_fn_zoot_cache_reconstruir()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  -- ⚠ UMA POR PAR: so' reconstroi se a marca ainda existe; o primeiro evento do par a apaga, os seguintes pulam.
  IF NOT EXISTS (SELECT 1 FROM public.zoot_cache_sujo WHERE fazenda_id = NEW.fazenda_id AND ano = NEW.ano) THEN
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM public._fn_refresh_zoot_cache(NEW.fazenda_id, NEW.ano);
    DELETE FROM public.zoot_cache_sujo WHERE fazenda_id = NEW.fazenda_id AND ano = NEW.ano;
  EXCEPTION WHEN OTHERS THEN
    -- ⚠ A GRAVACAO DE QUEM ESCREVEU NAO CAI: a marca fica, o cache antigo fica, e o pg_cron tenta de novo.
    RAISE WARNING 'ZOOT-CACHE-BURACO-01: reconstrucao de (%, %) falhou: % — fica para o pg_cron', NEW.fazenda_id, NEW.ano, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_status_pilares_ano(p_cliente_id uuid, p_ano integer)
 RETURNS TABLE(fazenda_id uuid, fazenda_nome text, ano_mes text, p1 text, p2 text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='nao_autenticado'; END IF;

  -- Sem isto, SECURITY DEFINER + cliente_id vindo por parametro = vazamento entre tenants.
  IF NOT (public.is_admin_agroinblue(v_uid)
    OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id)
                WHERE t.cliente_id = p_cliente_id)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem_permissao'; END IF;

  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION USING ERRCODE='22007',
      MESSAGE='ano_invalido: esperado entre 2000 e 2100';
  END IF;

  RETURN QUERY
    SELECT f.id,
           f.nome,
           to_char(make_date(p_ano, m.mm, 1),'YYYY-MM'),
           (public._fn_status_pilares_fechamento(f.id, to_char(make_date(p_ano, m.mm, 1),'YYYY-MM'))
             ->'p1_mapa_pastos'->>'status'),
           (public._fn_status_pilares_fechamento(f.id, to_char(make_date(p_ano, m.mm, 1),'YYYY-MM'))
             ->'p2_valor_rebanho'->>'status')
      FROM public.fazendas f
      CROSS JOIN (SELECT generate_series(1,12) mm) m
     WHERE f.cliente_id = p_cliente_id
       AND f.status_operacional = 'ativa'
     ORDER BY f.nome, 3;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_valor_rebanho_requer_p1_fechado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
BEGIN
  IF NEW.status != 'fechado' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'fechado' THEN RETURN NEW; END IF;
  _result := public._fn_can_close_valor_rebanho(NEW.fazenda_id, NEW.ano_mes);
  IF (_result->>'pode_fechar')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Nao e possivel fechar o Valor do Rebanho: %',
      COALESCE(_result->>'motivo', 'P1 nao esta oficial');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_lancamento_mes_fechado_p1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    DECLARE
      _mes_origem   text;
      _mes_destino  text;
      _p1_origem    text;
      _p1_destino   text;
      _orig_fechada boolean;
      _dest_fechado boolean;
      _par_mudou    boolean;
      _old_oficial  boolean;
      _new_oficial  boolean;
    BEGIN
      IF TG_OP = 'INSERT' AND NEW.cenario = 'meta' THEN RETURN NEW; END IF;
      IF TG_OP = 'UPDATE' AND OLD.cenario = 'meta' AND NEW.cenario = 'meta' THEN RETURN NEW; END IF;
      IF TG_OP = 'DELETE' AND OLD.cenario = 'meta' THEN RETURN OLD; END IF;

      IF TG_OP = 'INSERT' THEN
        _old_oficial := false;
        _new_oficial := NEW.cenario = 'realizado'
                        AND COALESCE(NEW.status_operacional, 'realizado') = 'realizado';
      ELSIF TG_OP = 'DELETE' THEN
        _old_oficial := OLD.cenario = 'realizado'
                        AND COALESCE(OLD.status_operacional, 'realizado') = 'realizado';
        _new_oficial := false;
      ELSE
        _old_oficial := OLD.cenario = 'realizado'
                        AND COALESCE(OLD.status_operacional, 'realizado') = 'realizado';
        _new_oficial := NEW.cenario = 'realizado'
                        AND COALESCE(NEW.status_operacional, 'realizado') = 'realizado';
      END IF;

      IF TG_OP = 'DELETE' THEN
        _mes_origem := substring(OLD.data::text, 1, 7);
        _p1_origem  := public._fn_status_pilares_fechamento(OLD.fazenda_id, _mes_origem)
                       #>> '{p1_mapa_pastos,status}';
        IF _p1_origem = 'oficial' AND _old_oficial THEN
          RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para excluir lançamentos.', _mes_origem;
        END IF;
        RETURN OLD;
      END IF;

      IF TG_OP = 'INSERT' THEN
        _mes_destino := substring(NEW.data::text, 1, 7);
        _p1_destino  := public._fn_status_pilares_fechamento(NEW.fazenda_id, _mes_destino)
                        #>> '{p1_mapa_pastos,status}';
        IF _p1_destino = 'oficial' AND _new_oficial THEN
          RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para inserir novos lançamentos.', _mes_destino;
        END IF;
        RETURN NEW;
      END IF;

      _mes_origem  := substring(OLD.data::text, 1, 7);
      _mes_destino := substring(NEW.data::text, 1, 7);
      _par_mudou   := (_mes_origem IS DISTINCT FROM _mes_destino)
                      OR (OLD.fazenda_id IS DISTINCT FROM NEW.fazenda_id);

      _p1_origem := public._fn_status_pilares_fechamento(OLD.fazenda_id, _mes_origem)
                    #>> '{p1_mapa_pastos,status}';
      IF _par_mudou THEN
        _p1_destino := public._fn_status_pilares_fechamento(NEW.fazenda_id, _mes_destino)
                       #>> '{p1_mapa_pastos,status}';
      ELSE
        _p1_destino := _p1_origem;
      END IF;

      _orig_fechada := (_p1_origem  = 'oficial');
      _dest_fechado := (_p1_destino = 'oficial');

      IF NOT _orig_fechada AND NOT _dest_fechado THEN
        RETURN NEW;
      END IF;

      IF OLD.cenario IS DISTINCT FROM NEW.cenario THEN
        RAISE EXCEPTION 'Período fechado no Mapa de Pastos (P1 oficial) envolvido (origem % / destino %). Não é possível alterar o cenário de um lançamento.', _mes_origem, _mes_destino;
      END IF;

      IF NOT _old_oficial AND NOT _new_oficial THEN
        RETURN NEW;
      END IF;

      IF _old_oficial AND NOT _new_oficial THEN
        IF _orig_fechada THEN
          RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Não é possível remover um fato oficial do período fechado (demoção de status).', _mes_origem;
        END IF;
        RETURN NEW;
      END IF;

      IF NOT _old_oficial AND _new_oficial THEN
        IF _dest_fechado THEN
          RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Não é possível promover lançamento a realizado em período fechado.', _mes_destino;
        END IF;
        RETURN NEW;
      END IF;

      IF _orig_fechada THEN
        IF (OLD.data               IS DISTINCT FROM NEW.data)
        OR (OLD.tipo               IS DISTINCT FROM NEW.tipo)
        OR (OLD.quantidade         IS DISTINCT FROM NEW.quantidade)
        OR (OLD.categoria          IS DISTINCT FROM NEW.categoria)
        OR (OLD.categoria_destino  IS DISTINCT FROM NEW.categoria_destino)
        OR (OLD.fazenda_id         IS DISTINCT FROM NEW.fazenda_id)
        OR (OLD.fazenda_destino IS DISTINCT FROM NEW.fazenda_destino AND OLD.tipo NOT IN ('morte','consumo'))
        OR (OLD.fazenda_origem     IS DISTINCT FROM NEW.fazenda_origem)
        OR (OLD.cancelado          IS DISTINCT FROM NEW.cancelado)
        OR (OLD.status_operacional IS DISTINCT FROM NEW.status_operacional)
        THEN
          RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para alterar campos estruturais.', _mes_origem;
        END IF;
        RETURN NEW;
      END IF;

      IF _par_mudou AND _dest_fechado THEN
        RAISE EXCEPTION 'O mês destino % também está fechado no Mapa de Pastos (P1 oficial).', _mes_destino;
      END IF;

      RETURN NEW;
    END;
$function$;

-- ═══ guardas de destino ═══
DO $guarda$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public._fn_zoot_categoria_mensal(uuid,  integer,  text)'::regprocedure, '5358f87341c38385325acfda96e4db8c'),
    ('public._fn_status_pilares_fechamento(uuid,  text)'::regprocedure, '84f5f2e344741c5a82cbb1b5f556a3d2'),
    ('public._fn_refresh_zoot_cache(uuid,  integer)'::regprocedure, '0fe8fda62d1950ad8068d641e1e4e3d1'),
    ('public._fn_refresh_zoot_cache(uuid,  integer,  text)'::regprocedure, '0c8d3c89142f74fd852f3ba79cfb2dfb'),
    ('public._fn_refresh_zoot_cache(uuid,  integer,  integer)'::regprocedure, '830741044c5c5cef5c028c73a43a76ac'),
    ('public._fn_can_close_valor_rebanho(uuid,  text)'::regprocedure, 'a37017ef43af7b8e2f50b47ad35e5cf0'),
    ('public.refresh_zoot_cache(uuid, integer)'::regprocedure, 'd3427246e8f437eecf0b73a2ecf1b19a'),
    ('public.refresh_zoot_cache(uuid, integer, text)'::regprocedure, 'cfe5d4f9cb86b6ed3ba14c9e15a88223'),
    ('public.refresh_zoot_cache(uuid, integer, integer)'::regprocedure, '0653e105d10252dfa7ddf82e06b74615'),
    ('public.fn_zoot_categoria_mensal(uuid, integer, text)'::regprocedure, '63b66fdcd083a360d655b3a681733688'),
    ('public.get_status_pilares_fechamento(uuid, text)'::regprocedure, 'c94a2c5431b44eae9a87161e00a61074'),
    ('public.can_close_valor_rebanho(uuid, text)'::regprocedure, 'f78602f39c34d4bca72c2933f7375c4a'),
    ('public.fn_zoot_cache_reconstruir_sujos()'::regprocedure, '336f7f4fa91d803d57ccb9e3c890e0b0'),
    ('public.trg_fn_zoot_cache_reconstruir()'::regprocedure, '8e5ea09a8ba1637573d926a5015e3577'),
    ('public.get_status_pilares_ano(uuid, integer)'::regprocedure, '746e8600d96ec06935ee5edf8383a9c7'),
    ('public.guard_valor_rebanho_requer_p1_fechado()'::regprocedure, '8fbec5c8d9488a9e22b9a828d716c0c3'),
    ('public.guard_lancamento_mes_fechado_p1()'::regprocedure, '1b71cb8916d691d3da162ad821d68be6')
  ) v(f, m) LOOP
    IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = r.f) IS DISTINCT FROM r.m THEN
      RAISE EXCEPTION '%: corpo de destino inesperado', r.f::text;
    END IF;
  END LOOP;
  -- as internas: fechadas para a API
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
               AND p.proname IN ('_fn_refresh_zoot_cache', '_fn_zoot_categoria_mensal', '_fn_status_pilares_fechamento', '_fn_can_close_valor_rebanho')
               AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE')
                    OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE') OR NOT p.prosecdef
                    OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0)))
     OR (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
           AND p.proname IN ('_fn_refresh_zoot_cache', '_fn_zoot_categoria_mensal', '_fn_status_pilares_fechamento', '_fn_can_close_valor_rebanho')) <> 6 THEN
    RAISE EXCEPTION 'internas: ACL inesperada ou contagem diferente de 6';
  END IF;
  -- as publicas: ACL, volatilidade, retorno e argumentos de antes
  IF EXISTS (SELECT 1 FROM _seg01b2_acl a JOIN pg_proc p ON p.oid = a.oid
              WHERE p.proacl::text IS DISTINCT FROM a.acl OR p.provolatile <> a.vol OR pg_get_function_result(p.oid) <> a.res
                 OR pg_get_function_arguments(p.oid) <> a.args OR NOT p.prosecdef)
     OR (SELECT count(*) FROM _seg01b2_acl) <> 6 THEN
    RAISE EXCEPTION 'publicas: ACL, volatilidade, retorno ou argumentos mudaram';
  END IF;
  IF NOT (SELECT p.prosecdef AND 'search_path=public' = ANY (p.proconfig) FROM pg_proc p WHERE p.oid = 'public.guard_lancamento_mes_fechado_p1()'::regprocedure) THEN
    RAISE EXCEPTION 'guard_lancamento_mes_fechado_p1 nao ficou SECURITY DEFINER com search_path fixo';
  END IF;
END $guarda$;
