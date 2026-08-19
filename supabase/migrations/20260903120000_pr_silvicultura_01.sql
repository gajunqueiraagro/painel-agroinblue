-- PR-SILVICULTURA-01 — eucalipto ganha família própria.
--
-- 'eucalipto' existe em fechamento_pastos desde 2023-08 (399 linhas, Sta. Luzia)
-- sem constar da lista oficial. Os 12 pastos foram reclassificados no CADASTRO
-- para 'agricultura' como rótulo de conveniência, e os cards de 2026-05 a
-- 2026-07 herdaram. A história real é eucalipto contínuo desde 2023-08.
--
-- NÃO TOCAR em nada anterior a 2026-05: recria (2020-01 a 2023-07) e eucalipto
-- (2023-08 a 2026-04) estão corretos e registram a conversão com precisão de mês.

UPDATE public.pastos p SET tipo_uso = 'eucalipto'
  FROM public.fazendas f
 WHERE f.id = p.fazenda_id AND f.nome ILIKE '%Luzia%'
   AND p.tipo_uso = 'agricultura';

UPDATE public.fechamento_pastos fp SET tipo_uso_mes = 'eucalipto'
  FROM public.pastos p, public.fazendas f
 WHERE p.id = fp.pasto_id AND f.id = p.fazenda_id
   AND f.nome ILIKE '%Luzia%'
   AND fp.ano_mes >= '2026-05'
   AND fp.tipo_uso_mes = 'agricultura';
