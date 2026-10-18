-- FIN-FINANC-28 · EDITAR = CADASTRO NOVO v2 — o cabecalho tambem grava a LINHA DE CREDITO (o cadastro a mostra; a 201400 esqueceu).
-- Patch guardado por md5 de `_fn_financiamento_salvar_cabecalho_exec` (origem, 3 ancoras contadas, destino). Linha de credito nao muda o cronograma.
set local lock_timeout = '2s';
do $patch$
declare
  c_origem  constant text := '103dd7eda2b1d2b5f7af85dd54844f27';
  c_destino constant text := 'f252549b82d9e795ebce7ac14b7f9507';
  a text[] := array[
    $a$'gerar_lancamento_captacao','plano_conta_captacao_id'];$a$,
    $a$  if d ? 'plano_conta_captacao_id' then$a$,
    $a$plano_conta_captacao_id = n.plano_conta_captacao_id,
    updated_at = now()$a$];
  r text[] := array[
    $r$'gerar_lancamento_captacao','plano_conta_captacao_id','linha_credito_id'];$r$,
    $r$  if d ? 'linha_credito_id' then n.linha_credito_id := nullif(d->>'linha_credito_id', '')::uuid; end if;
  if d ? 'plano_conta_captacao_id' then$r$,
    $r$plano_conta_captacao_id = n.plano_conta_captacao_id,
    linha_credito_id = n.linha_credito_id, updated_at = now()$r$];
  v_oid oid; v_src text; v_def text; v_k int; i int;
begin
  select p.oid, p.prosrc into v_oid, v_src from pg_proc p where p.proname = '_fn_financiamento_salvar_cabecalho_exec' and p.pronamespace = 'public'::regnamespace;
  if md5(v_src) is distinct from c_origem then raise exception 'cabecalho: md5 de origem %', md5(v_src); end if;
  v_def := pg_get_functiondef(v_oid);
  for i in 1 .. array_length(a, 1) loop
    v_k := (length(v_src) - length(replace(v_src, a[i], ''))) / length(a[i]);
    if v_k <> 1 then raise exception 'cabecalho: ancora % casou % vezes', i, v_k; end if;
    v_def := replace(v_def, a[i], r[i]);
  end loop;
  execute v_def;
  select md5(p.prosrc) into v_src from pg_proc p where p.oid = v_oid;
  if v_src is distinct from c_destino then raise exception 'cabecalho: md5 de destino %', v_src; end if;
end
$patch$;
revoke all on function public._fn_financiamento_salvar_cabecalho_exec(uuid, jsonb) from public, anon, authenticated;
grant execute on function public._fn_financiamento_salvar_cabecalho_exec(uuid, jsonb) to service_role;
