-- PR-CONC-CAIXA-PONTAS-PLANO-HOTFIX — a prova, numa transacao que TERMINA EM RAISE (nada fica gravado).
-- `supabase db query --linked -f supabase/tests/conc_caixa_pontas_plano_hotfix_test.sql`
--
-- P1 o proconfig de `fn_caixa_sistema_pontas` tem `plan_cache_mode=force_custom_plan` e o search_path de antes.
-- P2 o corpo nao mudou (md5 8a1cd4f9…), SECURITY DEFINER e ACL como estavam.
-- P3 20 chamadas na MESMA sessao (NJ Banco do Brasil, set/26, sessao do usuario): nenhuma acima de 500 ms — sem o SET,
--    da 6a em diante passava de 9 s. Os tempos vao na mensagem.
set local statement_timeout = '120s';

do $t$
declare v_md5 text; v_cfg text[]; v_sec boolean; v_acl text; bb uuid; t0 timestamptz; ms int; v_max int := 0; v_tempos text := ''; n int;
begin
  select md5(p.prosrc), p.proconfig, p.prosecdef, p.proacl::text into v_md5, v_cfg, v_sec, v_acl
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'fn_caixa_sistema_pontas';
  if not ('plan_cache_mode=force_custom_plan' = any (v_cfg)) or not ('search_path=pg_catalog, public' = any (v_cfg)) then
    raise exception 'P1 FALHOU: proconfig %', v_cfg;
  end if;
  if v_md5 <> '8a1cd4f9ecc02fa8eebb61a1c7093bd2' or not v_sec
     or v_acl <> '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' then
    raise exception 'P2 FALHOU: md5 % secdef % acl %', v_md5, v_sec, v_acl;
  end if;

  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  select id into bb from financeiro_contas_bancarias
   where cliente_id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd' and nome_exibicao = 'Banco do Brasil';
  for i in 1..20 loop
    t0 := clock_timestamp();
    select count(*) into n from fn_caixa_sistema_pontas('f2d67cd4-24d0-456f-a079-a3281dcce7fd', bb, '2026-09-01', '2026-09-30');
    ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    v_max := greatest(v_max, ms); v_tempos := v_tempos || ms || ' ';
  end loop;
  if v_max > 500 then raise exception 'P3 FALHOU: chamada de % ms (tempos: %)', v_max, v_tempos; end if;

  raise exception 'OK P1 proconfig % · P2 corpo % inalterado · P3 20 chamadas, max % ms: %', v_cfg, left(v_md5, 8), v_max, v_tempos
    using errcode = 'P0001';
end $t$;
