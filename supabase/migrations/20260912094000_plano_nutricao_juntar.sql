-- 20260912094000_plano_nutricao_juntar.sql
-- PLANO-NUTRICAO-01: junta os 3 subcentros de Nutricao (Cria/Recria/Engorda) num so
-- "Nutricao". Compra milho/racao/nucleo que distribui para todas as categorias, nao e
-- especifico por fase: a fase vira dimensao de rateio por % declarado (AGRI-04), nao
-- subcentro. 2.618 lancamentos re-apontados (Cria 867 + Engorda 1.312 + Recria 439), os 3
-- por fase inativados (nao apagados). Auditoria/editado_manual desligados na transacao.
-- APLICADA no proto em 2026-09-12 via Management API, apos ROLLBACK.
insert into financeiro_plano_contas (id,cliente_id,tipo_operacao,macro_custo,grupo_custo,centro_custo,subcentro,escopo_negocio,ativo,ordem_exibicao,compoe_dre,gera_lcdpr)
 select gen_random_uuid(),null,'2-Saídas','Custeio Produção','Custo Variável Pecuária','Nutrição','Nutrição','pecuaria',true,8045,true,null
 where not exists (select 1 from financeiro_plano_contas where cliente_id is null and subcentro='Nutrição' and grupo_custo='Custo Variável Pecuária');
alter table financeiro_lancamentos_v2 disable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 disable trigger trg_financeiro_lancamento_v2_editado_manual;
update financeiro_lancamentos_v2 l
   set plano_conta_id = (select id from financeiro_plano_contas where cliente_id is null and subcentro='Nutrição' and grupo_custo='Custo Variável Pecuária' limit 1),
       subcentro='Nutrição', centro_custo='Nutrição', grupo_custo='Custo Variável Pecuária'
 where l.plano_conta_id in ('8254f9b9-7ad7-4b60-a1f7-32f19a54b5af','93f1d1a3-ee70-459f-8e45-860a596c9c42','37f3665a-3079-4139-bcd7-9a3dd3c1bdce') and coalesce(l.cancelado,false)=false;
alter table financeiro_lancamentos_v2 enable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 enable trigger trg_financeiro_lancamento_v2_editado_manual;
update financeiro_plano_contas set ativo=false where id in ('8254f9b9-7ad7-4b60-a1f7-32f19a54b5af','93f1d1a3-ee70-459f-8e45-860a596c9c42','37f3665a-3079-4139-bcd7-9a3dd3c1bdce');
