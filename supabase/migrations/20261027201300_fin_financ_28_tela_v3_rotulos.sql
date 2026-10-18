-- FIN-FINANC-28 · TELA DO CONTRATO v3 — os rotulos que a tela le^ em portugues (Gabriel 18/10/2026: o item do encargo e'
-- "Encargo · IOF"). So' leitura; nenhuma tabela, coluna ou dado muda.
--   · fn_contrato_tela: o papel do encargo (Juros, IOF, Tarifa, Seguro, Multa, Outro), a forma da liberacao (em conta, a fornecedor,
--     liquidação de contrato), o tipo da baixa (Quitado, Rolado, Prorrogado, Cancelado) e a especie do documento (Cédula, Aditivo…)
--     saem escritos, no item dos pagamentos e nos eventos do historico. Valores, datas e contas nao mudam.
--   · Patch guardado por md5 (origem, 5 ancoras com a contagem esperada de cada uma, destino).
set local lock_timeout = '2s';

do $patch$
declare
  c_origem  constant text := '6af86b82c63c9e28858c4de1d0ecea31';
  c_destino constant text := '0c31b8f251f5539b8797bb9f31d0c70f';
  a text[] := array[
    $a$'Encargo · ' || coalesce(e ->> 'papel', 'outro')$a$,
    $a$'Liberação · ' || li.forma$a$,
    $a$' || b.tipo,$a$,
    $a$' || d.especie || '$a$];
  n int[] := array[1, 1, 2, 2];
  r text[] := array[
    $r$'Encargo · ' || case coalesce(e ->> 'papel', 'outro') when 'juros' then 'Juros' when 'iof' then 'IOF' when 'tarifa' then 'Tarifa' when 'seguro' then 'Seguro' when 'multa' then 'Multa' else 'Outro' end$r$,
    $r$'Liberação · ' || case li.forma when 'conta' then 'em conta' when 'fornecedor' then 'a fornecedor' when 'liquidacao' then 'liquidação de contrato' else li.forma end$r$,
    $r$' || case b.tipo when 'quitado' then 'Quitado' when 'rolado' then 'Rolado' when 'prorrogado' then 'Prorrogado' when 'cancelado' then 'Cancelado' else b.tipo end,$r$,
    $r$' || case d.especie when 'cedula' then 'Cédula' when 'aditivo' then 'Aditivo' when 'demonstrativo_saldo' then 'Demonstrativo de saldo' when 'comprovante_liberacao' then 'Comprovante de liberação' when 'comprovante_pagamento' then 'Comprovante de pagamento' else 'Outro' end || '$r$];
  v_oid oid; v_src text; v_def text; v_k int; i int;
begin
  select p.oid, p.prosrc into v_oid, v_src from pg_proc p where p.proname = 'fn_contrato_tela' and p.pronamespace = 'public'::regnamespace;
  if md5(v_src) is distinct from c_origem then raise exception 'fn_contrato_tela: md5 de origem %', md5(v_src); end if;
  v_def := pg_get_functiondef(v_oid);
  for i in 1 .. array_length(a, 1) loop
    v_k := (length(v_src) - length(replace(v_src, a[i], ''))) / length(a[i]);
    if v_k <> n[i] then raise exception 'fn_contrato_tela: ancora % casou % vezes (esperado %)', i, v_k, n[i]; end if;
    v_def := replace(v_def, a[i], r[i]);
  end loop;
  execute v_def;
  select md5(p.prosrc) into v_src from pg_proc p where p.oid = v_oid;
  if v_src is distinct from c_destino then raise exception 'fn_contrato_tela: md5 de destino %', v_src; end if;
end
$patch$;

revoke all on function public.fn_contrato_tela(uuid, date) from public, anon;
grant execute on function public.fn_contrato_tela(uuid, date) to authenticated, service_role;
