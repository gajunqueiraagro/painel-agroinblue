-- PERFIL-PROPRIETARIO-MULTI-01 — teste do lote 118820. Roda como postgres + claims, numa transação que termina em RAISE 'ENSAIO OK…'.
-- ANTES (bloco 1, rodar ANTES da migration): o 2º Proprietário do mesmo cliente é recusado (índice e frase) — prova que o teste sabe cair.
-- DEPOIS (bloco 2, rodar DEPOIS da migration): T1 sem índice · T2 dois Proprietários no mesmo cliente · T3 um Proprietário edita um acesso
-- do PRÓPRIO cliente e dá o perfil Proprietário · T4 o gestor não edita (42501) · T5 o Proprietário de OUTRO cliente não edita (42501)
-- · T6 ninguém altera o próprio acesso · T7 o admin segue editando.
-- Cliente de prova a2d41cda (financeiro · gestor · campo); NJ como "outro cliente".

-- ═══ bloco 1 — ANTES ═══
do $antes$
declare
  x uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  m_fin uuid := '310a23c5-5027-40fe-b947-b027cc728144'; m_cam uuid := '5da5e1ff-fab4-4ef6-ac74-a339285d13f4';
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  update public.cliente_membros set perfil = 'proprietario' where id = m_cam;
  begin
    update public.cliente_membros set perfil = 'proprietario' where id = m_fin;
    raise exception 'ANTES: o 2º Proprietário passou (o índice do 118790 não está lá?)';
  exception when unique_violation then null; end;
  update public.cliente_membros set perfil = 'campo' where id = m_cam;
end $antes$;

-- ═══ (aqui entra o arquivo supabase/migrations/20261028118820_perfil_proprietario_multi.sql) ═══

-- ═══ bloco 2 — DEPOIS ═══
do $t$
declare
  x uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  m_fin uuid := '310a23c5-5027-40fe-b947-b027cc728144'; u_fin uuid := '76f50f2e-015e-449c-b6b0-ca5ab71e05e4';
  m_ges uuid := 'e92e25b2-957f-4f23-af0c-9e1fa7b444b2'; u_ges uuid := '4b7e4456-113b-45d2-a00a-83b4d1c6380a';
  m_cam uuid := '5da5e1ff-fab4-4ef6-ac74-a339285d13f4'; u_cam uuid := '5941a5ab-4cfc-4693-bf68-6d593669ff00';
  m_nj uuid := '6aea7dee-6a4e-485e-8201-16a6637987b9';
  c_admin uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_ok text := ''; v_ret jsonb; v_err text;
  -- os dados de hoje do membro (nome, e-mail, fazendas): o editar só troca o perfil
  function_nome text;
begin
  set local statement_timeout = '30s';
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  if to_regclass('public.cliente_membros_um_proprietario') is not null then raise exception 'T1 o índice ficou'; end if;
  v_ok := v_ok || 'T1 · ';

  -- T2 o admin dá Proprietário a dois membros do mesmo cliente, pela função (gravando, dentro do ensaio)
  perform public._fn_membro_editar(c_admin, m_cam, coalesce((select nome from profiles where user_id = u_cam), 'Ensaio'),
    (select lower(email) from auth.users where id = u_cam), 'proprietario',
    (select array_agg(fm.fazenda_id) from fazenda_membros fm join fazendas f on f.id = fm.fazenda_id where fm.user_id = u_cam and f.cliente_id = x), false);
  perform public._fn_membro_editar(c_admin, m_fin, coalesce((select nome from profiles where user_id = u_fin), 'Ensaio'),
    (select lower(email) from auth.users where id = u_fin), 'proprietario',
    (select array_agg(fm.fazenda_id) from fazenda_membros fm join fazendas f on f.id = fm.fazenda_id where fm.user_id = u_fin and f.cliente_id = x), false);
  if (select count(*) from cliente_membros where cliente_id = x and ativo and perfil = 'proprietario') <> 2 then raise exception 'T2 não ficaram 2 Proprietários'; end if;
  v_ok := v_ok || 'T2 dois Proprietários · ';

  -- T3 um Proprietário (o campo de antes) edita o gestor do PRÓPRIO cliente e lhe dá Proprietário (simulado)
  v_ret := public._fn_membro_editar(u_cam, m_ges, coalesce((select nome from profiles where user_id = u_ges), 'Ensaio'),
    (select lower(email) from auth.users where id = u_ges), 'proprietario',
    (select array_agg(fm.fazenda_id) from fazenda_membros fm join fazendas f on f.id = fm.fazenda_id where fm.user_id = u_ges and f.cliente_id = x), true);
  if not (v_ret->>'simulado')::boolean or (v_ret->'depois'->>'perfil') <> 'proprietario' then raise exception 'T3 %', v_ret; end if;
  v_ok := v_ok || 'T3 Proprietário dá o perfil · ';

  -- T4 o gestor não edita
  begin perform public._fn_membro_editar(u_ges, m_cam, 'Ensaio', (select lower(email) from auth.users where id = u_cam), 'campo',
          (select array_agg(id) from fazendas where cliente_id = x), true); raise exception 'T4 o gestor editou';
  exception when sqlstate '42501' then v_ok := v_ok || 'T4 · '; end;

  -- T5 o Proprietário deste cliente não edita membro de OUTRO cliente (NJ)
  begin perform public._fn_membro_editar(u_cam, m_nj, 'Ensaio', 'ensaio@exemplo.com', 'financeiro',
          (select array_agg(id) from fazendas where cliente_id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'), true); raise exception 'T5 editou outro cliente';
  exception when sqlstate '42501' then v_ok := v_ok || 'T5 · '; end;

  -- T6 ninguém altera o próprio acesso
  begin perform public._fn_membro_editar(u_cam, m_cam, 'Ensaio', (select lower(email) from auth.users where id = u_cam), 'campo',
          (select array_agg(id) from fazendas where cliente_id = x), true); raise exception 'T6 alterou o próprio';
  exception when sqlstate '42501' then v_ok := v_ok || 'T6 · '; end;

  -- T7 o admin segue editando (simulado)
  v_ret := public._fn_membro_editar(c_admin, m_ges, coalesce((select nome from profiles where user_id = u_ges), 'Ensaio'),
    (select lower(email) from auth.users where id = u_ges), 'gestor_cliente',
    (select array_agg(fm.fazenda_id) from fazenda_membros fm join fazendas f on f.id = fm.fazenda_id where fm.user_id = u_ges and f.cliente_id = x), true);
  if not (v_ret->>'simulado')::boolean then raise exception 'T7'; end if;
  v_ok := v_ok || 'T7 · ';
  raise exception 'ENSAIO OK proprietario multi · % · corpo md5 %', v_ok, (select md5(prosrc) from pg_proc where proname = '_fn_membro_editar');
end $t$;
