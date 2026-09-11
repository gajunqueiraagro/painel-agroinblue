-- 20260911105000_plano_adm_02_reclass_nj.sql
-- PLANO-ADM-02: reclassificacao do NJ para Custo Fixo Administrativo, desde sempre.
-- Quatro subcentros inteiros (escritorio, contador, materiais, software) e a folha do
-- escritorio (Amanda, Neto, Luciana Abigail) por favorecido. Auditoria e editado_manual
-- desligados so nesta transacao: e reclassificacao em massa, nao edicao. O trigger
-- resolve_classificacao_from_plano preenche chave, grupo, centro e escopo pelo texto.
-- APLICADA no proto em 2026-09-11 via Management API, apos teste em ROLLBACK.
alter table financeiro_lancamentos_v2 disable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 disable trigger trg_financeiro_lancamento_v2_editado_manual;
update financeiro_lancamentos_v2 l set subcentro = case l.subcentro
   when 'Aluguel de Escritório Pecuária' then 'Aluguel de Escritório'
   when 'Contab. Jurídico e Consult. Pecuária' then 'Contab. Jurídico e Consultoria'
   when 'Materiais de Escritório Pecuária' then 'Materiais de Escritório'
   when 'Softwares Administrativos Pecuária' then 'Softwares Administrativos' end
 where l.cliente_id='f2d67cd4-24d0-456f-a079-a3281dcce7fd' and coalesce(l.cancelado,false)=false
   and l.subcentro in ('Aluguel de Escritório Pecuária','Contab. Jurídico e Consult. Pecuária','Materiais de Escritório Pecuária','Softwares Administrativos Pecuária');
update financeiro_lancamentos_v2 l set subcentro = case l.subcentro
   when 'Salários e Encargos Pecuária' then 'Salários e Encargos Administrativo'
   when 'Rescisões e Acertos Pecuária' then 'Rescisões e Acertos Administrativo'
   when 'Benefícios e Premiações Pecuária' then 'Benefícios e Premiações Administrativo' end
  from financeiro_fornecedores fo
 where fo.id=l.favorecido_id and l.cliente_id='f2d67cd4-24d0-456f-a079-a3281dcce7fd' and coalesce(l.cancelado,false)=false
   and (fo.nome ilike 'Amanda Montes%' or fo.nome ilike 'Antonio Neto%' or fo.nome ilike 'Luciana Abigail%')
   and l.subcentro in ('Salários e Encargos Pecuária','Rescisões e Acertos Pecuária','Benefícios e Premiações Pecuária');
alter table financeiro_lancamentos_v2 enable trigger trg_audit_financeiro_v2;
alter table financeiro_lancamentos_v2 enable trigger trg_financeiro_lancamento_v2_editado_manual;
-- Esperado apos aplicar (NJ, nao cancelados, grupo Custo Fixo Administrativo): 1.144 linhas, R$ 2.787.702.
