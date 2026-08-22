-- PR-CACHE-MOV-TIPOS-01 — o cache mensal preserva a QUEBRA POR TIPO.
--
-- O PROBLEMA. `zoot_mensal_cache` agrega tudo em `entradas_externas` /
-- `saidas_externas`. O PC-100 precisa das linhas Nascimentos, Compras,
-- Abates, Vendas, Venda em pe, Transf. Interna, Mortes e Consumo — em
-- cabecas e em kg. Sem elas a tela teria de consultar `lancamentos` a cada
-- render.
--
-- A INFORMACAO JA EXISTIA. `fn_zoot_categoria_mensal` ja separa NOMEADAMENTE
-- os nove tipos nos CTEs `mov_real` e `mov_meta` — e entao soma tudo em dois
-- baldes. Esta migration so deixa de jogar fora o que ja se calculava.
--
-- NADA DE TELA MUDA. E PR de banco, homologavel sozinho.
--
-- 18 COLUNAS = 9 tipos x 2 unidades. Ordem canonica, repetida IDENTICA nos
-- nove pontos de propagacao da funcao:
--   cab_nascimento, cab_compra, cab_transf_entrada,
--   cab_abate, cab_venda, cab_venda_pe, cab_transf_saida, cab_consumo,
--   cab_morte, e as nove `peso_*` na mesma sequencia.
--
-- `venda_pe` tem ZERO linhas em `lancamentos` hoje (medido 22/08/2026). As
-- duas colunas dele nascem sempre zero, mas existem porque o array da funcao
-- as preve e porque a soma de conferencia precisa delas para fechar.
--
-- `reclassificacao` NAO entra: ela ja e excluida do `mov_real` e tratada nos
-- CTEs proprios que viram `evol_cat_*`. Intocada.
--
-- `saldo_inicial` tambem nao ganha coluna: nao esta em nenhum dos dois
-- arrays da funcao, entao nunca foi entrada nem saida.
--
-- NAO RECONSTROI O CACHE. O rebuild e operacao separada, rodada depois da
-- conferencia. Ate la as 18 colunas ficam NULL — por isso sao nullable e sem
-- DEFAULT: NULL diz "ainda nao reconstruido", zero diria "nao houve
-- movimento", e sao coisas diferentes.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- PASSO 1 — as 18 colunas no cache.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.zoot_mensal_cache
  ADD COLUMN cab_nascimento numeric,
  ADD COLUMN cab_compra numeric,
  ADD COLUMN cab_transf_entrada numeric,
  ADD COLUMN cab_abate numeric,
  ADD COLUMN cab_venda numeric,
  ADD COLUMN cab_venda_pe numeric,
  ADD COLUMN cab_transf_saida numeric,
  ADD COLUMN cab_consumo numeric,
  ADD COLUMN cab_morte numeric,
  ADD COLUMN peso_nascimento numeric,
  ADD COLUMN peso_compra numeric,
  ADD COLUMN peso_transf_entrada numeric,
  ADD COLUMN peso_abate numeric,
  ADD COLUMN peso_venda numeric,
  ADD COLUMN peso_venda_pe numeric,
  ADD COLUMN peso_transf_saida numeric,
  ADD COLUMN peso_consumo numeric,
  ADD COLUMN peso_morte numeric;


-- ─────────────────────────────────────────────────────────────────────────
-- PASSO 4 — COMMENT em cada uma, dizendo o tipo de origem.
-- ─────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.zoot_mensal_cache.cab_nascimento IS
  'Movimentacao do tipo ''nascimento'' no mes, em cabecas. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.cab_compra IS
  'Movimentacao do tipo ''compra'' no mes, em cabecas. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.cab_transf_entrada IS
  'Movimentacao do tipo ''transferencia_entrada'' no mes, em cabecas. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.cab_abate IS
  'Movimentacao do tipo ''abate'' no mes, em cabecas. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.cab_venda IS
  'Movimentacao do tipo ''venda'' no mes, em cabecas. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.cab_venda_pe IS
  'Movimentacao do tipo ''venda_pe'' no mes, em cabecas. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.cab_transf_saida IS
  'Movimentacao do tipo ''transferencia_saida'' no mes, em cabecas. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.cab_consumo IS
  'Movimentacao do tipo ''consumo'' no mes, em cabecas. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.cab_morte IS
  'Movimentacao do tipo ''morte'' no mes, em cabecas. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.peso_nascimento IS
  'Movimentacao do tipo ''nascimento'' no mes, em kg. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.peso_compra IS
  'Movimentacao do tipo ''compra'' no mes, em kg. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.peso_transf_entrada IS
  'Movimentacao do tipo ''transferencia_entrada'' no mes, em kg. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.peso_abate IS
  'Movimentacao do tipo ''abate'' no mes, em kg. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.peso_venda IS
  'Movimentacao do tipo ''venda'' no mes, em kg. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.peso_venda_pe IS
  'Movimentacao do tipo ''venda_pe'' no mes, em kg. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.peso_transf_saida IS
  'Movimentacao do tipo ''transferencia_saida'' no mes, em kg. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.peso_consumo IS
  'Movimentacao do tipo ''consumo'' no mes, em kg. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';
COMMENT ON COLUMN public.zoot_mensal_cache.peso_morte IS
  'Movimentacao do tipo ''morte'' no mes, em kg. Origem: fn_zoot_categoria_mensal, CTE mov_real/mov_meta.';

-- ─────────────────────────────────────────────────────────────────────────
-- PASSO 2 — fn_zoot_categoria_mensal desdobrada.
--
-- DROP + CREATE, e nao CREATE OR REPLACE: a funcao e RETURNS TABLE e o
-- Postgres recusa mudanca de tipo de retorno com OR REPLACE. Conferido em
-- 22/08/2026 que NADA depende dela — pg_depend/pg_rewrite vazio, nenhuma
-- view, nenhuma regra.
--
-- `ent`, `sai`, `p_ent` e `p_sai` PERMANECEM intactos: outros consumidores
-- dependem deles, e eles passam a ser a soma exata das colunas novas.
--
-- mov_meta tem a MESMA estrutura de mov_real — mesmos arrays, mesmos quatro
-- sums. A unica diferenca e o filtro: mov_real exige
-- `status_operacional = 'realizado'`, mov_meta nao. Filtros preservados.
--
-- ATENCAO — o segundo ramo do UNION ALL de `mov_all` e POSICIONAL, sem um
-- unico alias. Ordem trocada ali nao gera erro: grava o dado do cenario meta
-- em coluna errada. As 18 entram na ordem canonica nos NOVE pontos, e isso
-- foi conferido por extracao automatica de cada bloco antes do commit.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_zoot_categoria_mensal(uuid, integer, text);


CREATE FUNCTION public.fn_zoot_categoria_mensal(p_fazenda_id uuid, p_ano integer, p_cenario text DEFAULT NULL::text)
 RETURNS TABLE(fazenda_id uuid, cliente_id uuid, ano integer, mes integer, cenario text, ano_mes text, categoria_id uuid, categoria_codigo text, categoria_nome text, ordem_exibicao integer, saldo_inicial integer, entradas_externas integer, saidas_externas integer, evol_cat_entrada integer, evol_cat_saida integer, saldo_final integer, peso_total_inicial numeric, peso_total_final numeric, peso_medio_inicial numeric, peso_medio_final numeric, peso_entradas_externas numeric, peso_saidas_externas numeric, peso_evol_cat_entrada numeric, peso_evol_cat_saida numeric, dias_mes integer, gmd numeric, producao_biologica numeric, fonte_oficial_mes text, saldo_sistema integer, saldo_p1 integer, cab_nascimento numeric, cab_compra numeric, cab_transf_entrada numeric, cab_abate numeric, cab_venda numeric, cab_venda_pe numeric, cab_transf_saida numeric, cab_consumo numeric, cab_morte numeric, peso_nascimento numeric, peso_compra numeric, peso_transf_entrada numeric, peso_abate numeric, peso_venda numeric, peso_venda_pe numeric, peso_transf_saida numeric, peso_consumo numeric, peso_morte numeric)
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
    sum(CASE WHEN l.tipo = 'morte' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_morte
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
    sum(CASE WHEN l.tipo = 'morte' THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_morte
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
    date_part('day', date_trunc('month', make_date(acb.ano, m.mes, 1)::timestamp) + '1 mon -1 days'::interval)::integer AS dias_mes,
    CASE WHEN acb.cenario = 'realizado' THEN fp.saldo_final ELSE NULL END AS fp_saldo_final,
    CASE WHEN acb.cenario = 'realizado' THEN fp.peso_total_final ELSE NULL END AS fp_peso_total_final,
    CASE WHEN acb.cenario = 'realizado' AND fp.saldo_final IS NOT NULL THEN 'fechamento' ELSE NULL END AS fonte_mes
  FROM all_cat_bases acb
  JOIN LATERAL generate_series(1, 12) m(mes) ON true
  LEFT JOIN mov_all ma ON ma.fazenda_id=acb.fazenda_id AND ma.categoria_id=acb.categoria_id AND ma.ano=acb.ano AND ma.mes=m.mes AND ma.cenario=acb.cenario
  LEFT JOIN LATERAL (
    SELECT sum(fpi.quantidade) AS saldo_final, sum(fpi.peso_total) AS peso_total_final
    FROM fechamento_pastos fp2 JOIN fechamento_pasto_itens fpi ON fpi.fechamento_id = fp2.id
    WHERE fp2.fazenda_id = acb.fazenda_id AND fp2.status = 'fechado'
      AND EXTRACT(year FROM (fp2.ano_mes||'-01')::date)::integer = acb.ano
      AND EXTRACT(month FROM (fp2.ano_mes||'-01')::date)::integer = m.mes
      AND fpi.categoria_id = acb.categoria_id
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
  round(peso_morte,2) AS peso_morte
FROM chain
WHERE (p_cenario IS NULL OR cenario = p_cenario)
  AND NOT (saldo_ini_calc=0 AND saldo_fin_calc=0 AND ent=0 AND sai=0 AND evol_ent=0 AND evol_sai=0)
$function$;


/* GRANT restaurado apos o DROP: fn_zoot_categoria_mensal e SECURITY
   DEFINER e o DROP apaga a ACL. Sem isto, `authenticated` perde EXECUTE
   e a tela quebra para todo usuario logado. ACL medida em 22/08:
   postgres=X/postgres, authenticated=X/postgres. */
ALTER FUNCTION public.fn_zoot_categoria_mensal(uuid, integer, text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_zoot_categoria_mensal(uuid, integer, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- PASSO 3 — as TRES overloads de refresh_zoot_cache.
--
-- Sao tres, nao uma: (uuid,int), (uuid,int,text) e (uuid,int,int). As tres
-- repetem o mesmo INSERT+SELECT, entao sao SEIS listas a atualizar —
-- esquecer uma deixa aquele caminho de refresh gravando NULL nas 18 novas,
-- em silencio.
--
-- Vao de CREATE OR REPLACE: o retorno e `void` e nao muda, entao NAO perdem
-- a ACL (authenticated + service_role) e nao precisam de GRANT.
--
-- Elas so COPIAM: nenhuma conta acontece aqui.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
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
    peso_transf_saida, peso_consumo, peso_morte
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
    peso_transf_saida, peso_consumo, peso_morte
  FROM public.fn_zoot_categoria_mensal(p_fazenda_id, p_ano);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_cenario text)
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
    peso_transf_saida, peso_consumo, peso_morte
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
    peso_transf_saida, peso_consumo, peso_morte
  FROM public.fn_zoot_categoria_mensal(p_fazenda_id, p_ano, p_cenario);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_mes integer)
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
    peso_transf_saida, peso_consumo, peso_morte
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
    peso_transf_saida, peso_consumo, peso_morte
  FROM public.fn_zoot_categoria_mensal(p_fazenda_id, p_ano)
   WHERE mes = p_mes;
END;
$function$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (comentado)
--
-- Esta migration faz DROP da funcao, entao SEM este bloco nao ha volta: a
-- versao anterior de fn_zoot_categoria_mensal so existe aqui.
--
-- O texto abaixo e o pg_get_functiondef() LITERAL de 22/08/2026, 14.053
-- caracteres, conferido byte a byte contra o banco antes de ser copiado —
-- nao foi redigitado.
--
-- As 18 colunas do cache tambem caem. Elas nunca chegaram a ser lidas por
-- tela nenhuma neste PR, entao o DROP COLUMN nao quebra front.
--
-- ORDEM OBRIGATORIA: as refresh_zoot_cache voltam ANTES do DROP COLUMN,
-- senao elas ficam referenciando colunas que deixaram de existir.
--
-- BEGIN;
--
-- -- 1. as tres refresh_zoot_cache, sem as 18 colunas

-- CREATE OR REPLACE FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer)
--  RETURNS void
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'pg_catalog', 'public'
-- AS $function$
-- BEGIN
--   DELETE FROM public.zoot_mensal_cache WHERE fazenda_id = p_fazenda_id AND ano = p_ano;
--   INSERT INTO public.zoot_mensal_cache (
--     fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
--     categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
--     saldo_inicial, entradas_externas, saidas_externas,
--     evol_cat_entrada, evol_cat_saida, saldo_final,
--     peso_total_inicial, peso_total_final,
--     peso_medio_inicial, peso_medio_final,
--     peso_entradas_externas, peso_saidas_externas,
--     peso_evol_cat_entrada, peso_evol_cat_saida,
--     dias_mes, gmd, producao_biologica,
--     fonte_oficial_mes, updated_at, saldo_sistema, saldo_p1
--   )
--   SELECT
--     fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
--     categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
--     saldo_inicial, entradas_externas, saidas_externas,
--     evol_cat_entrada, evol_cat_saida, saldo_final,
--     peso_total_inicial, peso_total_final,
--     peso_medio_inicial, peso_medio_final,
--     peso_entradas_externas, peso_saidas_externas,
--     peso_evol_cat_entrada, peso_evol_cat_saida,
--     dias_mes, gmd, producao_biologica,
--     fonte_oficial_mes, now(), saldo_sistema, saldo_p1
--   FROM public.fn_zoot_categoria_mensal(p_fazenda_id, p_ano);
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_cenario text)
--  RETURNS void
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'pg_catalog', 'public'
-- AS $function$
-- BEGIN
--   DELETE FROM public.zoot_mensal_cache WHERE fazenda_id = p_fazenda_id AND ano = p_ano AND cenario = p_cenario;
--   INSERT INTO public.zoot_mensal_cache (
--     fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
--     categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
--     saldo_inicial, entradas_externas, saidas_externas,
--     evol_cat_entrada, evol_cat_saida, saldo_final,
--     peso_total_inicial, peso_total_final,
--     peso_medio_inicial, peso_medio_final,
--     peso_entradas_externas, peso_saidas_externas,
--     peso_evol_cat_entrada, peso_evol_cat_saida,
--     dias_mes, gmd, producao_biologica,
--     fonte_oficial_mes, updated_at, saldo_sistema, saldo_p1
--   )
--   SELECT
--     fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
--     categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
--     saldo_inicial, entradas_externas, saidas_externas,
--     evol_cat_entrada, evol_cat_saida, saldo_final,
--     peso_total_inicial, peso_total_final,
--     peso_medio_inicial, peso_medio_final,
--     peso_entradas_externas, peso_saidas_externas,
--     peso_evol_cat_entrada, peso_evol_cat_saida,
--     dias_mes, gmd, producao_biologica,
--     fonte_oficial_mes, now(), saldo_sistema, saldo_p1
--   FROM public.fn_zoot_categoria_mensal(p_fazenda_id, p_ano, p_cenario);
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_mes integer)
--  RETURNS void
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'pg_catalog', 'public'
-- AS $function$
-- BEGIN
--   DELETE FROM public.zoot_mensal_cache WHERE fazenda_id = p_fazenda_id AND ano = p_ano AND mes = p_mes;
--   INSERT INTO public.zoot_mensal_cache (
--     fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
--     categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
--     saldo_inicial, entradas_externas, saidas_externas,
--     evol_cat_entrada, evol_cat_saida, saldo_final,
--     peso_total_inicial, peso_total_final,
--     peso_medio_inicial, peso_medio_final,
--     peso_entradas_externas, peso_saidas_externas,
--     peso_evol_cat_entrada, peso_evol_cat_saida,
--     dias_mes, gmd, producao_biologica,
--     fonte_oficial_mes, updated_at, saldo_sistema, saldo_p1
--   )
--   SELECT
--     fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
--     categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
--     saldo_inicial, entradas_externas, saidas_externas,
--     evol_cat_entrada, evol_cat_saida, saldo_final,
--     peso_total_inicial, peso_total_final,
--     peso_medio_inicial, peso_medio_final,
--     peso_entradas_externas, peso_saidas_externas,
--     peso_evol_cat_entrada, peso_evol_cat_saida,
--     dias_mes, gmd, producao_biologica,
--     fonte_oficial_mes, now(), saldo_sistema, saldo_p1
--   FROM public.fn_zoot_categoria_mensal(p_fazenda_id, p_ano)
--    WHERE mes = p_mes;
-- END;
-- $function$;
--
-- -- 2. a funcao anterior, integra
-- DROP FUNCTION IF EXISTS public.fn_zoot_categoria_mensal(uuid, integer, text);
--
-- CREATE OR REPLACE FUNCTION public.fn_zoot_categoria_mensal(p_fazenda_id uuid, p_ano integer, p_cenario text DEFAULT NULL::text)
--  RETURNS TABLE(fazenda_id uuid, cliente_id uuid, ano integer, mes integer, cenario text, ano_mes text, categoria_id uuid, categoria_codigo text, categoria_nome text, ordem_exibicao integer, saldo_inicial integer, entradas_externas integer, saidas_externas integer, evol_cat_entrada integer, evol_cat_saida integer, saldo_final integer, peso_total_inicial numeric, peso_total_final numeric, peso_medio_inicial numeric, peso_medio_final numeric, peso_entradas_externas numeric, peso_saidas_externas numeric, peso_evol_cat_entrada numeric, peso_evol_cat_saida numeric, dias_mes integer, gmd numeric, producao_biologica numeric, fonte_oficial_mes text, saldo_sistema integer, saldo_p1 integer)
--  LANGUAGE sql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- WITH RECURSIVE
-- categorias AS (SELECT id, codigo, nome, ordem_exibicao FROM categorias_rebanho),
-- saldo_ini_cat AS (
--   SELECT si.fazenda_id, si.cliente_id, si.ano, cr.id AS categoria_id, cr.codigo, cr.nome AS categoria_nome, cr.ordem_exibicao,
--     sum(si.quantidade)::numeric AS cab_ini, sum(si.quantidade::numeric * COALESCE(si.peso_medio_kg, 0)) AS peso_ini
--   FROM saldos_iniciais si JOIN categorias cr ON cr.codigo = si.categoria
--   WHERE si.fazenda_id = p_fazenda_id AND si.ano = p_ano
--   GROUP BY si.fazenda_id, si.cliente_id, si.ano, cr.id, cr.codigo, cr.nome, cr.ordem_exibicao
-- ),
-- mov_real AS (
--   SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
--     EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
--     sum(CASE WHEN l.tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade ELSE 0 END)::numeric AS ent,
--     sum(CASE WHEN l.tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade ELSE 0 END)::numeric AS sai,
--     sum(CASE WHEN l.tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS p_ent,
--     sum(CASE WHEN l.tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS p_sai
--   FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria
--   WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
--     AND l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
--   GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
-- ),
-- rcl_sai_real AS (
--   SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
--     EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
--     sum(l.quantidade)::numeric AS qtd, sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
--   FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria
--   WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
--     AND l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL
--     AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
--   GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
-- ),
-- rcl_ent_real AS (
--   SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
--     EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
--     sum(l.quantidade)::numeric AS qtd, sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
--   FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria_destino
--   WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
--     AND l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL
--     AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
--   GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
-- ),
-- mov_meta AS (
--   SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
--     EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
--     sum(CASE WHEN l.tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade ELSE 0 END)::numeric AS ent,
--     sum(CASE WHEN l.tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade ELSE 0 END)::numeric AS sai,
--     sum(CASE WHEN l.tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS p_ent,
--     sum(CASE WHEN l.tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS p_sai
--   FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria
--   WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
--     AND l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'meta'
--   GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
-- ),
-- rcl_sai_meta AS (
--   SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
--     EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
--     sum(l.quantidade)::numeric AS qtd, sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
--   FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria
--   WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
--     AND l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'meta'
--   GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
-- ),
-- rcl_ent_meta AS (
--   SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
--     EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
--     sum(l.quantidade)::numeric AS qtd, sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
--   FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria_destino
--   WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
--     AND l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'meta'
--   GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
-- ),
-- mov_all AS (
--   SELECT COALESCE(m.fazenda_id,re.fazenda_id,rs.fazenda_id) AS fazenda_id, COALESCE(m.cliente_id,re.cliente_id,rs.cliente_id) AS cliente_id,
--     COALESCE(m.categoria_id,re.categoria_id,rs.categoria_id) AS categoria_id,
--     COALESCE(m.ano,re.ano,rs.ano) AS ano, COALESCE(m.mes,re.mes,rs.mes) AS mes,
--     COALESCE(m.ent,0) AS ent, COALESCE(m.sai,0) AS sai,
--     COALESCE(re.qtd,0) AS evol_ent, COALESCE(rs.qtd,0) AS evol_sai,
--     COALESCE(m.p_ent,0) AS p_ent, COALESCE(m.p_sai,0) AS p_sai,
--     COALESCE(re.peso,0) AS p_evol_ent, COALESCE(rs.peso,0) AS p_evol_sai, 'realizado'::text AS cenario
--   FROM mov_real m
--   FULL JOIN rcl_ent_real re ON re.fazenda_id=m.fazenda_id AND re.categoria_id=m.categoria_id AND re.ano=m.ano AND re.mes=m.mes
--   FULL JOIN rcl_sai_real rs ON rs.fazenda_id=COALESCE(m.fazenda_id,re.fazenda_id) AND rs.categoria_id=COALESCE(m.categoria_id,re.categoria_id) AND rs.ano=COALESCE(m.ano,re.ano) AND rs.mes=COALESCE(m.mes,re.mes)
--   UNION ALL
--   SELECT COALESCE(m.fazenda_id,re.fazenda_id,rs.fazenda_id), COALESCE(m.cliente_id,re.cliente_id,rs.cliente_id),
--     COALESCE(m.categoria_id,re.categoria_id,rs.categoria_id),
--     COALESCE(m.ano,re.ano,rs.ano), COALESCE(m.mes,re.mes,rs.mes),
--     COALESCE(m.ent,0), COALESCE(m.sai,0), COALESCE(re.qtd,0), COALESCE(rs.qtd,0),
--     COALESCE(m.p_ent,0), COALESCE(m.p_sai,0), COALESCE(re.peso,0), COALESCE(rs.peso,0), 'meta'::text
--   FROM mov_meta m
--   FULL JOIN rcl_ent_meta re ON re.fazenda_id=m.fazenda_id AND re.categoria_id=m.categoria_id AND re.ano=m.ano AND re.mes=m.mes
--   FULL JOIN rcl_sai_meta rs ON rs.fazenda_id=COALESCE(m.fazenda_id,re.fazenda_id) AND rs.categoria_id=COALESCE(m.categoria_id,re.categoria_id) AND rs.ano=COALESCE(m.ano,re.ano) AND rs.mes=COALESCE(m.mes,re.mes)
-- ),
-- all_cat_bases AS (
--   SELECT p_fazenda_id AS fazenda_id,
--     COALESCE(si.cliente_id, (SELECT f.cliente_id FROM fazendas f WHERE f.id = p_fazenda_id LIMIT 1)) AS cliente_id,
--     p_ano AS ano, cr.id AS categoria_id, scen.cenario, cr.codigo, cr.nome AS categoria_nome, cr.ordem_exibicao,
--     COALESCE(si.cab_ini, 0) AS cab_ini_ano, COALESCE(si.peso_ini, 0) AS peso_ini_ano
--   FROM categorias cr
--   CROSS JOIN (VALUES ('realizado'::text), ('meta'::text)) AS scen(cenario)
--   LEFT JOIN saldo_ini_cat si ON si.categoria_id = cr.id
--   WHERE cr.id IN (SELECT categoria_id FROM mov_all UNION ALL SELECT categoria_id FROM saldo_ini_cat)
-- ),
-- expanded AS (
--   SELECT acb.fazenda_id, acb.cliente_id, acb.categoria_id, acb.codigo, acb.categoria_nome, acb.ordem_exibicao,
--     acb.ano, m.mes, m.mes AS seq, acb.cenario, acb.cab_ini_ano, acb.peso_ini_ano,
--     COALESCE(ma.ent,0) AS ent, COALESCE(ma.sai,0) AS sai,
--     COALESCE(ma.evol_ent,0) AS evol_ent, COALESCE(ma.evol_sai,0) AS evol_sai,
--     COALESCE(ma.p_ent,0) AS p_ent, COALESCE(ma.p_sai,0) AS p_sai,
--     COALESCE(ma.p_evol_ent,0) AS p_evol_ent, COALESCE(ma.p_evol_sai,0) AS p_evol_sai,
--     date_part('day', date_trunc('month', make_date(acb.ano, m.mes, 1)::timestamp) + '1 mon -1 days'::interval)::integer AS dias_mes,
--     CASE WHEN acb.cenario = 'realizado' THEN fp.saldo_final ELSE NULL END AS fp_saldo_final,
--     CASE WHEN acb.cenario = 'realizado' THEN fp.peso_total_final ELSE NULL END AS fp_peso_total_final,
--     CASE WHEN acb.cenario = 'realizado' AND fp.saldo_final IS NOT NULL THEN 'fechamento' ELSE NULL END AS fonte_mes
--   FROM all_cat_bases acb
--   JOIN LATERAL generate_series(1, 12) m(mes) ON true
--   LEFT JOIN mov_all ma ON ma.fazenda_id=acb.fazenda_id AND ma.categoria_id=acb.categoria_id AND ma.ano=acb.ano AND ma.mes=m.mes AND ma.cenario=acb.cenario
--   LEFT JOIN LATERAL (
--     SELECT sum(fpi.quantidade) AS saldo_final, sum(fpi.peso_total) AS peso_total_final
--     FROM fechamento_pastos fp2 JOIN fechamento_pasto_itens fpi ON fpi.fechamento_id = fp2.id
--     WHERE fp2.fazenda_id = acb.fazenda_id AND fp2.status = 'fechado'
--       AND EXTRACT(year FROM (fp2.ano_mes||'-01')::date)::integer = acb.ano
--       AND EXTRACT(month FROM (fp2.ano_mes||'-01')::date)::integer = m.mes
--       AND fpi.categoria_id = acb.categoria_id
--     GROUP BY fpi.categoria_id
--   ) fp ON acb.cenario = 'realizado'
-- ),
-- chain AS (
--   SELECT e.fazenda_id, e.cliente_id, e.categoria_id, e.codigo, e.categoria_nome, e.ordem_exibicao,
--     e.ano, e.mes, e.seq, e.cenario, e.dias_mes, e.fonte_mes,
--     e.ent, e.sai, e.evol_ent, e.evol_sai, e.p_ent, e.p_sai, e.p_evol_ent, e.p_evol_sai,
--     e.cab_ini_ano, e.peso_ini_ano,
--     e.cab_ini_ano AS saldo_ini_calc, e.peso_ini_ano AS peso_ini_calc,
--     COALESCE(e.fp_saldo_final::numeric, e.cab_ini_ano + e.ent - e.sai + e.evol_ent - e.evol_sai) AS saldo_fin_calc,
--     COALESCE(e.fp_peso_total_final, e.peso_ini_ano + e.p_ent - e.p_sai + e.p_evol_ent - e.p_evol_sai) AS peso_fin_calc,
--     e.cab_ini_ano AS saldo_ini_sistema,
--     (e.cab_ini_ano + e.ent - e.sai + e.evol_ent - e.evol_sai) AS saldo_fin_sistema,
--     e.fp_saldo_final AS fp_sf
--   FROM expanded e WHERE e.mes = 1
--   UNION ALL
--   SELECT e.fazenda_id, e.cliente_id, e.categoria_id, e.codigo, e.categoria_nome, e.ordem_exibicao,
--     e.ano, e.mes, e.seq, e.cenario, e.dias_mes, e.fonte_mes,
--     e.ent, e.sai, e.evol_ent, e.evol_sai, e.p_ent, e.p_sai, e.p_evol_ent, e.p_evol_sai,
--     e.cab_ini_ano, e.peso_ini_ano,
--     c.saldo_fin_calc AS saldo_ini_calc, c.peso_fin_calc AS peso_ini_calc,
--     COALESCE(e.fp_saldo_final::numeric, c.saldo_fin_calc + e.ent - e.sai + e.evol_ent - e.evol_sai) AS saldo_fin_calc,
--     COALESCE(e.fp_peso_total_final, c.peso_fin_calc + e.p_ent - e.p_sai + e.p_evol_ent - e.p_evol_sai) AS peso_fin_calc,
--     c.saldo_fin_sistema AS saldo_ini_sistema,
--     (c.saldo_fin_sistema + e.ent - e.sai + e.evol_ent - e.evol_sai) AS saldo_fin_sistema,
--     e.fp_saldo_final AS fp_sf
--   FROM chain c JOIN expanded e
--     ON e.fazenda_id=c.fazenda_id AND e.cenario=c.cenario
--     AND e.categoria_id=c.categoria_id AND e.ano=c.ano AND e.seq=(c.seq+1)
-- )
-- SELECT fazenda_id, cliente_id, ano, mes, cenario,
--   (ano::text||'-')||lpad(mes::text,2,'0') AS ano_mes,
--   categoria_id, codigo AS categoria_codigo, categoria_nome, ordem_exibicao,
--   saldo_ini_calc::integer AS saldo_inicial,
--   ent::integer AS entradas_externas, sai::integer AS saidas_externas,
--   evol_ent::integer AS evol_cat_entrada, evol_sai::integer AS evol_cat_saida,
--   saldo_fin_calc::integer AS saldo_final,
--   round(peso_ini_calc,2) AS peso_total_inicial, round(peso_fin_calc,2) AS peso_total_final,
--   CASE WHEN saldo_ini_calc>0 THEN round(peso_ini_calc/saldo_ini_calc,2) ELSE NULL END AS peso_medio_inicial,
--   CASE WHEN saldo_fin_calc>0 THEN round(peso_fin_calc/saldo_fin_calc,2) ELSE NULL END AS peso_medio_final,
--   round(p_ent,2) AS peso_entradas_externas, round(p_sai,2) AS peso_saidas_externas,
--   round(p_evol_ent,2) AS peso_evol_cat_entrada, round(p_evol_sai,2) AS peso_evol_cat_saida,
--   dias_mes,
--   CASE WHEN ((saldo_ini_calc+saldo_fin_calc)/2.0)>0 AND dias_mes>0
--     THEN round((peso_fin_calc-peso_ini_calc-p_ent+p_sai-p_evol_ent+p_evol_sai)/((saldo_ini_calc+saldo_fin_calc)/2.0*dias_mes),4)
--     ELSE NULL END AS gmd,
--   round(peso_fin_calc-peso_ini_calc-p_ent+p_sai-p_evol_ent+p_evol_sai,2) AS producao_biologica,
--   fonte_mes AS fonte_oficial_mes,
--   saldo_fin_sistema::integer AS saldo_sistema,
--   CASE WHEN fonte_mes = 'fechamento' THEN fp_sf::integer ELSE NULL END AS saldo_p1
-- FROM chain
-- WHERE (p_cenario IS NULL OR cenario = p_cenario)
--   AND NOT (saldo_ini_calc=0 AND saldo_fin_calc=0 AND ent=0 AND sai=0 AND evol_ent=0 AND evol_sai=0)
-- $function$
-- ;
-- ALTER FUNCTION public.fn_zoot_categoria_mensal(uuid, integer, text) OWNER TO postgres;
-- GRANT EXECUTE ON FUNCTION public.fn_zoot_categoria_mensal(uuid, integer, text) TO authenticated;
--
-- -- 3. por fim, as colunas
-- ALTER TABLE public.zoot_mensal_cache
--   DROP COLUMN cab_nascimento,
--   DROP COLUMN cab_compra,
--   DROP COLUMN cab_transf_entrada,
--   DROP COLUMN cab_abate,
--   DROP COLUMN cab_venda,
--   DROP COLUMN cab_venda_pe,
--   DROP COLUMN cab_transf_saida,
--   DROP COLUMN cab_consumo,
--   DROP COLUMN cab_morte,
--   DROP COLUMN peso_nascimento,
--   DROP COLUMN peso_compra,
--   DROP COLUMN peso_transf_entrada,
--   DROP COLUMN peso_abate,
--   DROP COLUMN peso_venda,
--   DROP COLUMN peso_venda_pe,
--   DROP COLUMN peso_transf_saida,
--   DROP COLUMN peso_consumo,
--   DROP COLUMN peso_morte;
--
-- COMMIT;
