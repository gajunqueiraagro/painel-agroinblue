-- FIN-FINANC-28 · TELA DO CONTRATO v3 — contrato ENCERRADO nao tem "A resolver" (Gabriel 18/10/2026: "237.729.00/03, caso
-- quitado: selo Quitado, A resolver some"). So' leitura; nenhuma tabela, coluna ou dado muda.
--   · fn_contrato_tela: com o contrato quitado, rolado ou cancelado o `a_resolver` volta vazio — as pendencias de dado (cedula,
--     CNPJ do credor, condicoes) deixam de ser cobradas num contrato que ja' acabou. O resto do retorno nao muda.
--   · Patch guardado por md5 (origem, 1 ancora contada, destino). Reexecutar sobre o corpo ja' corrigido falha na guarda de origem.
set local lock_timeout = '2s';

do $patch$
declare
  c_origem  constant text := 'f61a4603f88e98dc62b0bb61631aaa9a';
  c_destino constant text := '6af86b82c63c9e28858c4de1d0ecea31';
  c_ancora  constant text := E'\n  return jsonb_build_object(\n    ''financiamento_id''';
  c_novo    constant text := E'\n  if f.status in (''quitado'', ''rolado'', ''cancelado'') then\n    v_res := ''[]''::jsonb;\n  end if;\n\n  return jsonb_build_object(\n    ''financiamento_id''';
  v_oid oid; v_src text; v_def text; v_n int;
begin
  select p.oid, p.prosrc into v_oid, v_src from pg_proc p where p.proname = 'fn_contrato_tela' and p.pronamespace = 'public'::regnamespace;
  if md5(v_src) is distinct from c_origem then raise exception 'fn_contrato_tela: md5 de origem %', md5(v_src); end if;
  v_n := (length(v_src) - length(replace(v_src, c_ancora, ''))) / length(c_ancora);
  if v_n <> 1 then raise exception 'fn_contrato_tela: ancora casou % vezes', v_n; end if;
  v_def := replace(pg_get_functiondef(v_oid), c_ancora, c_novo);
  execute v_def;
  select md5(p.prosrc) into v_src from pg_proc p where p.oid = v_oid;
  if v_src is distinct from c_destino then raise exception 'fn_contrato_tela: md5 de destino %', v_src; end if;
end
$patch$;

revoke all on function public.fn_contrato_tela(uuid, date) from public, anon;
grant execute on function public.fn_contrato_tela(uuid, date) to authenticated, service_role;
