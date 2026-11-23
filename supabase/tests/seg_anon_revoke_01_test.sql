-- SEG-ANON-REVOKE-01 (118445) — teste. Roda como postgres; termina em RAISE 'OK…'; nada fica no banco.
-- A1 nenhuma relação do public (tabela, view, matview) dá privilégio ao anon.
-- A2 o anon é RECUSADO (42501) numa tabela de backup sem política — a sonda que distingue: antes do 118445 ela LIA (0 linhas pela RLS);
--    numa tabela com política que chama função (financeiro_recorrencias) o anon já caía em 42501 pela função, e a sonda não distingue.
-- A3 o authenticated segue lendo o que lia (uma tabela de cliente e uma view) — o revoke foi só do anon.
do $t$
declare v_n int; v_estado text;
begin
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
     and has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger');
  if v_n <> 0 then raise exception 'A1: % relações com o anon', v_n; end if;

  execute 'set local role anon';
  begin perform 1 from public.bkp_oc_canceladas_20260827 limit 1; v_estado := 'leu'; exception when others then v_estado := sqlstate; end;
  execute 'reset role';
  if v_estado is distinct from '42501' then raise exception 'A2: o anon %', v_estado; end if;

  if not has_table_privilege('authenticated', 'public.financeiro_recorrencias', 'select,insert,update')
     or not has_table_privilege('authenticated', 'public.vw_oc_obrigacoes', 'select') then
    raise exception 'A3: o authenticated perdeu acesso';
  end if;
  raise exception 'OK SEG-ANON-REVOKE-01: A1–A3 (nada gravado)';
end $t$;
