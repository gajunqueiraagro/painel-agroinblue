-- Backfill valor_rebanho_fechamento.valor_total for all records with valor_total = 0.
-- Uses: saldos_iniciais + lancamentos (saldo por categoria) × peso (fechamento_pastos ou saldo_inicial) × preco (valor_rebanho_mensal).
-- This is a one-time data correction to ensure the official source always has the correct total.

WITH saldo_inicial AS (
  SELECT fazenda_id, ano, categoria, SUM(quantidade) AS quantidade, 
         COALESCE(MAX(peso_medio_kg), 0) AS peso_medio_kg
  FROM public.saldos_iniciais
  GROUP BY fazenda_id, ano, categoria
),
lancamento_deltas AS (
  SELECT fazenda_id, categoria,
         EXTRACT(YEAR FROM data::date)::int AS ano,
         EXTRACT(MONTH FROM data::date)::int AS mes,
         SUM(CASE 
           WHEN tipo IN ('nascimento','compra','transferencia_entrada') THEN quantidade
           WHEN tipo IN ('abate','venda','transferencia_saida','consumo','morte') THEN -quantidade
           WHEN tipo = 'reclassificacao' THEN -quantidade
           ELSE 0
         END) AS delta_cat,
         SUM(CASE 
           WHEN tipo = 'reclassificacao' AND categoria_destino IS NOT NULL THEN quantidade
           ELSE 0
         END) AS reclass_in
  FROM public.lancamentos
  WHERE status_operacional = 'conciliado'
  GROUP BY fazenda_id, categoria, EXTRACT(YEAR FROM data::date)::int, EXTRACT(MONTH FROM data::date)::int
),
-- Build cumulative saldo per fazenda/categoria up to each ano_mes
fechamento_targets AS (
  SELECT id, fazenda_id, ano_mes,
         EXTRACT(YEAR FROM (ano_mes || '-01')::date)::int AS ano,
         EXTRACT(MONTH FROM (ano_mes || '-01')::date)::int AS mes
  FROM public.valor_rebanho_fechamento
  WHERE valor_total = 0
),
saldo_acum AS (
  SELECT ft.id, ft.fazenda_id, ft.ano_mes, ft.ano, ft.mes, si.categoria,
         COALESCE(si.quantidade, 0) + COALESCE((
           SELECT SUM(ld.delta_cat)
           FROM lancamento_deltas ld
           WHERE ld.fazenda_id = ft.fazenda_id
             AND ld.categoria = si.categoria
             AND ld.ano = ft.ano
             AND ld.mes <= ft.mes
         ), 0) AS saldo_final
  FROM fechamento_targets ft
  JOIN saldo_inicial si ON si.fazenda_id = ft.fazenda_id AND si.ano = ft.ano
),
pesos_pastos AS (
  SELECT fp.fazenda_id, fp.ano_mes, c.codigo AS categoria,
         SUM(fpi.quantidade * COALESCE(fpi.peso_medio_kg, 0)) / NULLIF(SUM(fpi.quantidade), 0) AS peso_medio
  FROM public.fechamento_pastos fp
  JOIN public.fechamento_pasto_itens fpi ON fpi.fechamento_id = fp.id
  JOIN public.categorias_rebanho c ON c.id = fpi.categoria_id
  GROUP BY fp.fazenda_id, fp.ano_mes, c.codigo
),
valor_calc AS (
  SELECT sa.id,
         SUM(
           GREATEST(sa.saldo_final, 0) *
           COALESCE(pp.peso_medio, si2.peso_medio_kg, 0) *
           COALESCE(vrm.preco_kg, 0)
         ) AS valor_total_calc
  FROM saldo_acum sa
  LEFT JOIN pesos_pastos pp ON pp.fazenda_id = sa.fazenda_id AND pp.ano_mes = sa.ano_mes AND pp.categoria = sa.categoria
  LEFT JOIN saldo_inicial si2 ON si2.fazenda_id = sa.fazenda_id AND si2.ano = sa.ano AND si2.categoria = sa.categoria
  LEFT JOIN public.valor_rebanho_mensal vrm ON vrm.fazenda_id = sa.fazenda_id AND vrm.ano_mes = sa.ano_mes AND vrm.categoria = sa.categoria
  GROUP BY sa.id
)
UPDATE public.valor_rebanho_fechamento vrf
SET valor_total = vc.valor_total_calc,
    updated_at = now()
FROM valor_calc vc
WHERE vrf.id = vc.id
  AND vc.valor_total_calc > 0;