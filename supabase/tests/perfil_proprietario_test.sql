-- PERFIL-PROPRIETARIO A+B (118780 + 118790) — teste. Roda como postgres DEPOIS das duas migrations, numa transação que termina em
-- RAISE 'ENSAIO OK…' (nada fica). Ensaio de 25/11 15:4x: A+B na MESMA transação (R1, P1, D-P1, P3, P4 verdes; P2 = 55P04, esperado).
-- ⚠ O P2 (o que passa pelo get_user_perfil, o cast para o enum: fiscal, importação, cancelar zootécnica, aprovação) só se prova
--   DEPOIS do commit do lote A: na transação que adicionou o valor, o Postgres recusa usá-lo (55P04). Rodar este arquivo de novo
--   depois do A aplicado, com o P2 esperando TRUE.
-- Cliente de prova a2d41cda (financeiro · gestor · campo); o membro "campo" vira Proprietário dentro da transação.
do $t$
declare
  x uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  m_fin uuid := '310a23c5-5027-40fe-b947-b027cc728144'; u_fin uuid := '76f50f2e-015e-449c-b6b0-ca5ab71e05e4';
  u_ges uuid := '4b7e4456-113b-45d2-a00a-83b4d1c6380a';
  m_cam uuid := '5da5e1ff-fab4-4ef6-ac74-a339285d13f4'; u_cam uuid := '5941a5ab-4cfc-4693-bf68-6d593669ff00';
  c_admin uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_ok text := ''; v_err text; v_b boolean; v_mail text; v_faz uuid[]; v_ret jsonb;
begin
  set local statement_timeout = '30s';
  -- R1 regressão: gestor e financeiro com o mesmo acesso de antes
  perform set_config('request.jwt.claims', json_build_object('sub', u_ges, 'role', 'authenticated')::text, true);
  if not public._fn_fiscal_certificado_pode(x) or not public.can_manage_financeiro_importacao_v2(x) or not public._fn_documento_pode_ver(x)
     or not public._fn_entrada_pode_gerir(x) then raise exception 'R1 o gestor perdeu acesso'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_fin, 'role', 'authenticated')::text, true);
  if not public.can_manage_financeiro_importacao_v2(x) or public._fn_fiscal_certificado_pode(x) or public._fn_documento_pode_ver(x) then
    raise exception 'R1 o financeiro mudou de acesso'; end if;
  v_ok := v_ok || 'R1 · ';
  -- P1 campo não vê; Proprietário vê documento e gere entrada (comparação por texto)
  perform set_config('request.jwt.claims', json_build_object('sub', u_cam, 'role', 'authenticated')::text, true);
  if public._fn_documento_pode_ver(x) or public._fn_entrada_pode_gerir(x) then raise exception 'P1 campo já via'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  update public.cliente_membros set perfil = 'proprietario' where id = m_cam;
  perform set_config('request.jwt.claims', json_build_object('sub', u_cam, 'role', 'authenticated')::text, true);
  if not public._fn_documento_pode_ver(x) or not public._fn_entrada_pode_gerir(x) then raise exception 'P1 o Proprietário não vê/gere'; end if;
  v_ok := v_ok || 'P1 · ';
  -- P2 pelo get_user_perfil (depois do commit do A: tem de dar TRUE nos quatro)
  begin
    if not public._fn_fiscal_certificado_pode(x) or not public.can_manage_financeiro_importacao_v2(x)
       or not public.can_manage_financeiro_lancamento_v2(x, 'manual') then raise exception 'P2 o Proprietário sem fiscal/importação'; end if;
    v_ok := v_ok || 'P2 · ';
  exception when sqlstate '55P04' then
    v_ok := v_ok || 'P2 55P04 (ainda na transação do A) · ';
  end;
  -- D-P1 um Proprietário por cliente
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  begin update public.cliente_membros set perfil = 'proprietario' where id = m_fin; raise exception 'D-P1 índice passou';
  exception when unique_violation then v_ok := v_ok || 'D-P1 índice · '; end;
  select lower(email) into v_mail from auth.users where id = u_fin;
  select array_agg(id) into v_faz from public.fazendas where cliente_id = x;
  begin
    v_ret := public._fn_membro_editar(c_admin, m_fin, 'Ensaio', v_mail, 'proprietario', v_faz, true);
    raise exception 'D-P1 editar passou %', v_ret;
  exception when others then
    v_err := sqlerrm;
    if v_err <> 'Este cliente já tem um Proprietário: troque o perfil dele antes.' then raise exception 'D-P1 editar: %', v_err; end if;
    v_ok := v_ok || 'D-P1 frase · ';
  end;
  -- P3 o editar aceita o perfil (simulado); P4 só o admin edita
  select lower(email) into v_mail from auth.users where id = u_cam;
  v_ret := public._fn_membro_editar(c_admin, m_cam, 'Ensaio', v_mail, 'proprietario', v_faz, true);
  if not (v_ret->>'simulado')::boolean then raise exception 'P3 simular gravou'; end if;
  v_ok := v_ok || 'P3 · ';
  perform set_config('request.jwt.claims', json_build_object('sub', u_ges, 'role', 'authenticated')::text, true);
  begin perform public._fn_membro_editar(u_ges, m_fin, 'Ensaio', v_mail, 'financeiro', v_faz, true); raise exception 'P4 gestor editou';
  exception when sqlstate '42501' then v_ok := v_ok || 'P4 · '; end;
  raise exception 'ENSAIO OK proprietario · %', v_ok;
end $t$;
