-- 20260911142000_plano_adm_05_escritorio_todos.sql
-- PLANO-ADM-05: escritorio e administrativo em todos os clientes (aluguel, contador,
-- materiais, software), desde sempre, inclusive os subcentros "...Agricultura".
-- Folha do escritorio dos outros clientes fica para quando houver nomes. Auditoria e
-- editado_manual desligados so nesta transacao. Trigger resolve chave/grupo/escopo pelo texto.
-- APLICADA no proto em 2026-09-11 via Management API, apos teste em ROLLBACK (1.273 linhas).
alter table financeiro_lancamentos_v2 disable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 disable trigger trg_financeiro_lancamento_v2_editado_manual;
update financeiro_lancamentos_v2 l set subcentro = case l.subcentro
   when 'Aluguel de Escritório Pecuária' then 'Aluguel de Escritório'
   when 'Contab. Jurídico e Consult. Pecuária' then 'Contab. Jurídico e Consultoria'
   when 'Materiais de Escritório Pecuária' then 'Materiais de Escritório'
   when 'Softwares Administrativos Pecuária' then 'Softwares Administrativos'
   when 'Aluguel de Escritório Agricultura' then 'Aluguel de Escritório'
   when 'Contab. Jurídico e Consultoria Agricultura' then 'Contab. Jurídico e Consultoria'
   when 'Materiais de Escritório Agricultura' then 'Materiais de Escritório'
   when 'Softwares Administrativos Agricultura' then 'Softwares Administrativos' end
 where coalesce(l.cancelado,false)=false
   and l.subcentro in ('Aluguel de Escritório Pecuária','Contab. Jurídico e Consult. Pecuária','Materiais de Escritório Pecuária','Softwares Administrativos Pecuária','Aluguel de Escritório Agricultura','Contab. Jurídico e Consultoria Agricultura','Materiais de Escritório Agricultura','Softwares Administrativos Agricultura');
alter table financeiro_lancamentos_v2 enable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 enable trigger trg_financeiro_lancamento_v2_editado_manual;
