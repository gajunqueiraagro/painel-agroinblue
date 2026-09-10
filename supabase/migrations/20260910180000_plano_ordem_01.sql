-- 20260910180000_plano_ordem_01.sql
-- PLANO-ORDEM-01: ordem_exibicao por grupo = centro a-z, subcentro a-z (pt-BR), passo 10,
-- base do grupo preservada (6xxx continua 6xxx, 20410 continua 20410). So globais ativos;
-- os 8 subcentros por cliente nao sao tocados. Duplicata cruzada pre-existente (3020 em
-- Outras Receitas e em Outras Entradas, grupos diferentes) fica como esta.
-- APLICADA no proto em 2026-09-10 via Management API, apos teste em ROLLBACK.
with r as (
  select id,
         min(ordem_exibicao) over (partition by tipo_operacao, macro_custo, grupo_custo, escopo_negocio) as base,
         row_number() over (partition by tipo_operacao, macro_custo, grupo_custo, escopo_negocio
                            order by centro_custo collate "pt-BR-x-icu", subcentro collate "pt-BR-x-icu") as rn
    from financeiro_plano_contas where cliente_id is null and ativo)
update financeiro_plano_contas p
   set ordem_exibicao = r.base + (r.rn-1)*10, updated_at = now()
  from r
 where r.id = p.id and p.ordem_exibicao is distinct from r.base + (r.rn-1)*10;
