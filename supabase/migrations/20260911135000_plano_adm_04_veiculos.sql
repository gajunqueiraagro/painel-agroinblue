-- 20260911135000_plano_adm_04_veiculos.sql
-- PLANO-ADM-04: veiculos do escritorio/proprietario no Custo Fixo Administrativo (centro Maquinas).
-- Trator continua na atividade; caminhonete do gerente da pecuaria continua em Pecuaria.
-- Uso pessoal do produtor e Dividendos, nao custo. Aprovado pelo Gabriel em 11/09.
-- APLICADA no proto em 2026-09-11 via Management API, apos teste em ROLLBACK.
insert into financeiro_plano_contas (id,cliente_id,tipo_operacao,macro_custo,grupo_custo,centro_custo,subcentro,escopo_negocio,ativo,ordem_exibicao,compoe_dre,gera_lcdpr) values
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Fixo Administrativo','Máquinas','Combustível Veículos Administrativo','administrativo',true,21120,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Fixo Administrativo','Máquinas','Manutenção Veículos Administrativo','administrativo',true,21130,true,null),
 (gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Fixo Administrativo','Máquinas','Seguro e Impostos Veículos Administrativo','administrativo',true,21140,true,null);
