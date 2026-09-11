-- 20260911103000_plano_adm_01.sql
-- PLANO-ADM-01: grupo Custeio Producao > Custo Fixo Administrativo (escopo administrativo,
-- DRE sim). Ate aqui escritorio, contador, software e folha administrativa caiam em
-- Custo Fixo Pecuaria e a lavoura saia de graca. O DRE consolidado nao muda; o DRE por
-- atividade ganha uma linha de rateio administrativo com percentual declarado por cliente
-- (frente propria). Regra de uso: administrativo e o que serve as duas atividades e nao
-- da para separar. Aprovado pelo Gabriel em 10/09.
-- APLICADA no proto em 2026-09-11 via Management API, apos teste em ROLLBACK.
insert into financeiro_plano_contas (id,cliente_id,tipo_operacao,macro_custo,grupo_custo,centro_custo,subcentro,escopo_negocio,ativo,ordem_exibicao,compoe_dre,gera_lcdpr) values
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Fixo Administrativo','Administração','Aluguel de Escritório','administrativo',true,21010,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Fixo Administrativo','Administração','Comunicação e Energia Escritório','administrativo',true,21020,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Fixo Administrativo','Administração','Contab. Jurídico e Consultoria','administrativo',true,21030,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Fixo Administrativo','Administração','Materiais de Escritório','administrativo',true,21040,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Fixo Administrativo','Administração','Outras Despesas Administrativas','administrativo',true,21050,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Fixo Administrativo','Administração','Softwares Administrativos','administrativo',true,21060,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Fixo Administrativo','Administração','Viagens e Deslocamentos Administrativo','administrativo',true,21070,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Fixo Administrativo','Impostos','Taxas e Impostos Administrativos','administrativo',true,21080,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Fixo Administrativo','Mão de Obra','Benefícios e Premiações Administrativo','administrativo',true,21090,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Fixo Administrativo','Mão de Obra','Rescisões e Acertos Administrativo','administrativo',true,21100,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Fixo Administrativo','Mão de Obra','Salários e Encargos Administrativo','administrativo',true,21110,true,null);
