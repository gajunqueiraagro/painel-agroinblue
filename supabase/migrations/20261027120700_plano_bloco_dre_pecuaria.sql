-- PLANO-BLOCO-DRE-PEC: bloco_dre para pecuaria e administrativo
alter table public.financeiro_plano_contas drop constraint financeiro_plano_contas_bloco_dre_check;
alter table public.financeiro_plano_contas add constraint financeiro_plano_contas_bloco_dre_check check (bloco_dre is null or bloco_dre = any (array['receita','deducao','custeio','pos_colheita','fixo','juros','investimento','venda','reposicao','variavel']));
update public.financeiro_plano_contas set bloco_dre = case
  when escopo_negocio='pecuaria' and grupo_custo='Receita Pecuária' and centro_custo in ('Abates','Venda Peso Vivo','Venda Geral') then 'venda'
  when escopo_negocio='pecuaria' and grupo_custo='Receita Pecuária' then 'receita'
  when escopo_negocio='pecuaria' and grupo_custo='Deduções Pecuária' then 'deducao'
  when escopo_negocio='pecuaria' and grupo_custo='Compra de Bovinos' then 'reposicao'
  when escopo_negocio='pecuaria' and grupo_custo='Custo Variável Pecuária' then 'variavel'
  when escopo_negocio='pecuaria' and grupo_custo='Custo Fixo Pecuária' then 'fixo'
  when escopo_negocio='pecuaria' and grupo_custo='Juros de Financiamento Pecuária' then 'juros'
  when escopo_negocio='pecuaria' and grupo_custo='Investimento Pecuária' then 'investimento'
  when escopo_negocio='administrativo' and grupo_custo='Custo Fixo Administrativo' then 'fixo'
  else null end
where escopo_negocio in ('pecuaria','administrativo') and bloco_dre is null;
