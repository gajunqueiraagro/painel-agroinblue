-- CONC-CONFERENCIA-MES-01 — lote 118810 (Code 4; D2 GO do Gabriel 25/11 14:30). A Conferência ganha as colunas Tipo e NF do lado do sistema.
-- As linhas do sistema (`sistema_completo` de fn_extratos_espelhados) passam a trazer 6 colunas CRUAS do lançamento: recorrencia_id,
-- numero_documento, tipo_documento, financiamento_id, origem_tipo e eh_folha. NENHUMA regra nova no banco: o selo (F · R · P i/N · O · ⇄ ·
-- FP · —) e o rótulo da NF saem na tela pelas MESMAS peças da tela de Lançamentos (`vinculosDaLinha`, `docDaLinha`); a parcela i/N e a OC,
-- pelos mesmos leitores dela (`useParcelasDosLancamentos`, `useLancamentosComOC`).
-- eh_folha = o lançamento está ligado à folha (folha_pessoas, folha_guias, folha_por_fora ou folha_documentos). Em 25/11: 22 lançamentos.
-- ⚠ PATCH GUARDADO POR MD5: o corpo de hoje tem de ser o conferido em 25/11 (d2fea66f…); cada trecho casa exatamente 1 vez; o resto do
--   corpo fica byte a byte. Assinatura, SECURITY, ACL e `force_custom_plan` não mudam (CREATE OR REPLACE pelo pg_get_functiondef).
set local lock_timeout = '2s';

do $patch$
declare
  c_fn constant regprocedure := 'public.fn_extratos_espelhados(uuid, uuid, text)'::regprocedure;
  c_md5 constant text := 'd2fea66f923842e8c58bf285c3054803';
  v_def text; v_md5 text; v_n int; r record; v_acl text; v_cfg text;
begin
  select md5(prosrc), pg_get_functiondef(oid), proacl::text, proconfig::text into v_md5, v_def, v_acl, v_cfg from pg_proc where oid = c_fn;
  if v_md5 is distinct from c_md5 then
    raise exception 'CONC-CONFERENCIA-MES-01: fn_extratos_espelhados mudou desde a conferência (md5 %, esperava %)', v_md5, c_md5; end if;
  for r in select * from (values
    ($$ AS oc_parcela FROM financeiro_lancamentos_v2 l JOIN pp ON true WHERE l.cliente_id = pp.cli AND l.data_pagamento$$,
     $$ AS oc_parcela, l.recorrencia_id, l.numero_documento, l.tipo_documento, l.financiamento_id, l.origem_tipo, (EXISTS (SELECT 1 FROM folha_pessoas fx WHERE fx.lancamento_id = l.id) OR EXISTS (SELECT 1 FROM folha_guias fx WHERE fx.lancamento_id = l.id) OR EXISTS (SELECT 1 FROM folha_por_fora fx WHERE fx.lancamento_id = l.id) OR EXISTS (SELECT 1 FROM folha_documentos fx WHERE fx.lancamento_id = l.id)) AS eh_folha FROM financeiro_lancamentos_v2 l JOIN pp ON true WHERE l.cliente_id = pp.cli AND l.data_pagamento$$),
    ($$'oc_parcela',oc_parcela,'pontas',public._fn_conc_transf_pontas(id)) ORDER BY dt, id),'[]'::jsonb) FROM sis_status)$$,
     $$'oc_parcela',oc_parcela,'pontas',public._fn_conc_transf_pontas(id),'recorrencia_id',recorrencia_id,'numero_documento',numero_documento,'tipo_documento',tipo_documento,'financiamento_id',financiamento_id,'origem_tipo',origem_tipo,'eh_folha',eh_folha) ORDER BY dt, id),'[]'::jsonb) FROM sis_status)$$)
  ) x(de, para) loop
    v_n := (length(v_def) - length(replace(v_def, r.de, ''))) / length(r.de);
    if v_n <> 1 then raise exception 'CONC-CONFERENCIA-MES-01: o trecho "%" casa % vez(es), esperava 1', left(r.de, 60), v_n; end if;
    v_def := replace(v_def, r.de, r.para);
  end loop;
  execute v_def;
  if (select md5(prosrc) from pg_proc where oid = c_fn) = c_md5 then raise exception 'CONC-CONFERENCIA-MES-01: o corpo não mudou'; end if;
  if (select proacl::text from pg_proc where oid = c_fn) is distinct from v_acl or (select proconfig::text from pg_proc where oid = c_fn) is distinct from v_cfg then
    raise exception 'CONC-CONFERENCIA-MES-01: a ACL ou a configuração da função mudou'; end if;
end $patch$;
