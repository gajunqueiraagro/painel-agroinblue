-- 20260910150000_plano_lavoura_01.sql
-- PLANO-01: plano de contas de lavoura (spec docs/specs/AGRI-FECHAMENTO-v1.md, adendo D12)
-- 3 movidos de Custo Fixo para Custo Variavel Agricultura + 9 subcentros novos.
-- Referencia por NOME de subcentro: ordem_exibicao do banco difere do .md antigo.
-- APLICADA no proto em 2026-09-10 15:15 via Management API, apos teste em ROLLBACK.

-- MOVER
update financeiro_plano_contas
   set grupo_custo='Custo Variável Agricultura', centro_custo='Operações Mecanizadas',
       ordem_exibicao=13130, updated_at=now()
 where cliente_id is null and subcentro='Combustível Máquinas Agricultura';

update financeiro_plano_contas
   set grupo_custo='Custo Variável Agricultura', centro_custo='Operações Mecanizadas',
       ordem_exibicao=13140, updated_at=now()
 where cliente_id is null and subcentro='Manutenção Máquinas Agricultura';

update financeiro_plano_contas
   set centro_custo='Pós-Colheita', updated_at=now()
 where cliente_id is null and subcentro='Armazenagem Agrícola Agricultura';

-- alinhar as copias no lancamento (93 linhas, 3 ja divergiam)
update financeiro_lancamentos_v2 l
   set grupo_custo=p.grupo_custo, centro_custo=p.centro_custo
  from financeiro_plano_contas p
 where p.id=l.plano_conta_id and p.cliente_id is null
   and p.subcentro in ('Combustível Máquinas Agricultura',
                       'Manutenção Máquinas Agricultura',
                       'Armazenagem Agrícola Agricultura')
   and (l.grupo_custo is distinct from p.grupo_custo
     or l.centro_custo is distinct from p.centro_custo);

-- CRIAR (9)
insert into financeiro_plano_contas
  (id,cliente_id,tipo_operacao,macro_custo,grupo_custo,centro_custo,subcentro,
   escopo_negocio,ativo,ordem_exibicao,compoe_dre,gera_lcdpr)
values
 (gen_random_uuid(),null,'1-Entradas','Receita Operacional','Receita Agrícola','Venda Produção','Venda de Mandioca','agricultura',true,2070,true,null),
 (gen_random_uuid(),null,'2-Saídas','Deduções de Receitas','Deduções Agricultura','Impostos','Impostos e Despesas de Vendas Agricultura','agricultura',true,10030,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Variável Agricultura','Operações Mecanizadas','Serviços Mecanizados Terceirizados','agricultura',true,13150,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Variável Agricultura','Insumos','Corretivos de Solo','agricultura',true,13160,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Variável Agricultura','Insumos','Manivas e Material de Propagação','agricultura',true,13170,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Variável Agricultura','Mão de Obra Direta','Diaristas e Empreita Lavoura','agricultura',true,13180,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Variável Agricultura','Pós-Colheita','Secagem e Beneficiamento','agricultura',true,13190,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Variável Agricultura','Terra','Arrendamento de Área Agrícola','agricultura',true,13200,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Variável Agricultura','Serviços','Assistência Técnica Agrícola','agricultura',true,13210,true,null);
