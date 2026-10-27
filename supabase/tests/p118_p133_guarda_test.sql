-- P118 + P133 (depois da 20261028112430) — a guarda das funcoes da conversao. Termina em RAISE 'OK'. Transacao revertida; so' simulacao.
--   G1 sem usuario (postgres/service_role, quem executa): a simulacao segue
--   G2 usuario logado que nao e' admin AgroInBlue: 42501 no aplicar e no desfazer (antes de tocar em qualquer linha)
--   G3 admin AgroInBlue: a simulacao segue
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '50s';
DO $teste$
declare
  v jsonb; u_comum uuid; u_admin uuid; c_rrcc constant uuid := '537661af-a934-4c66-b138-f8dbc378a00f'; ok int := 0;
begin
  select id into u_comum from auth.users u where not coalesce(public.is_admin_agroinblue(u.id), false) limit 1;
  select id into u_admin from auth.users u where public.is_admin_agroinblue(u.id) limit 1;
  if u_comum is null or u_admin is null then raise exception 'sem usuario comum ou admin para o teste'; end if;

  -- G1
  v := public.fn_texto_conversao_aplicar('p118-caixa-alta', c_rrcc, true);
  if v->>'simulado' <> 'true' then raise exception 'G1: %', v; end if;

  -- G2
  perform set_config('request.jwt.claims', json_build_object('sub', u_comum, 'role', 'authenticated')::text, true);
  begin perform public.fn_texto_conversao_aplicar('p118-caixa-alta', c_rrcc, true); raise exception 'G2 aplicar passou';
  exception when sqlstate '42501' then ok := ok + 1; end;
  begin perform public.fn_texto_conversao_desfazer('p118-caixa-alta', c_rrcc); raise exception 'G2 desfazer passou';
  exception when sqlstate '42501' then ok := ok + 1; end;
  if ok <> 2 then raise exception 'G2 %/2', ok; end if;

  -- G3
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  v := public.fn_texto_conversao_aplicar('p118-caixa-alta', c_rrcc, true);
  if v->>'simulado' <> 'true' then raise exception 'G3: %', v; end if;

  raise exception 'OK guarda (G1 G2 G3)';
end $teste$;
ROLLBACK;
