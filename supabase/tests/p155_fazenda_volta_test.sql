-- P155 (b) — `fn_p155_fazenda_aplicar` / `fn_p155_fazenda_desfazer` (migration 20261028113030). Fixture SINTETICA no cliente Teste: a fazenda
-- de sempre (X), uma "Administrativo Sintetico" (ADM), uma segunda administrativa (ADM2) e uma comum (Y); seis lancamentos em X:
--   L1 a edicao humana levou X → ADM (o defeito) ............................................. volta para X
--   L4 X → ADM e depois uma edicao so' de status (sem mexer na fazenda) ...................... volta para X
--   L2 X → ADM e depois ADM → Y (alguem mudou depois) ........................................ fica (nao e' mais Administrativo)
--   L3 nenhuma edicao ........................................................................ fica (sem a edicao)
--   L5 a edicao levou X → Y (uma fazenda comum) .............................................. fica (nao e' Administrativo)
--   L6 X → ADM por pessoa; depois uma ROTINA (via 'outra') ADM → ADM2 ......................... fica (a ultima edicao humana nao o pos ali)
-- Roda como postgres (rotina do sistema) e TERMINA EM RAISE: nada fica.
-- T1 simular: voltaram L1 e L4, os 4 pulados com o motivo, e nada mudou · T2 aplicar: L1/L4 em X, o resto como estava; backup 2; a trilha
-- de L1 diz via 'sistema:p155' (rotina, sem usuario) · T3 desfazer: L4 mexido depois fica; L1 volta para ADM · T4 fechada: authenticated/anon nao executam.
-- Mutacao: tirar a guarda "agora e' Administrativo" derruba T1 (L5 voltaria); tirar "a ultima edicao o pos aqui" derruba T1 (L6 voltaria).
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  x uuid; adm uuid; adm2 uuid; y uuid; pl uuid; ids uuid[];
begin
  select id into x from public.fazendas where cliente_id = c_cli order by id limit 1;
  insert into public.fazendas (cliente_id, nome, codigo, owner_id) values (c_cli, 'Administrativo Sintetico', 'ADMS', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e') returning id into adm;
  insert into public.fazendas (cliente_id, nome, codigo, owner_id) values (c_cli, 'Administrativo Dois Sintetico', 'ADM2', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e') returning id into adm2;
  insert into public.fazendas (cliente_id, nome, codigo, owner_id) values (c_cli, 'Fazenda Sintetica Dois', 'FS2', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e') returning id into y;
  select id into pl from public.financeiro_plano_contas where ativo and tipo_operacao = '2-Saídas' and escopo_negocio = 'pecuaria'
    and (cliente_id is null or cliente_id = c_cli) order by id limit 1;
  if x is null or pl is null then raise exception 'fixture: o Teste precisa de fazenda e conta pecuaria de saida'; end if;
  with n as (
    insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
        status_transacao, cenario, cancelado, plano_conta_id)
    select c_cli, x, '-1', '2-Saídas', 100 + k, 'P155 sintetico ' || k, '2031-03-01', '2031-03-10', 'previsto', 'realizado', false, pl
      from generate_series(1, 6) k
    returning id, descricao)
  select array_agg(id order by descricao) into ids from n;
  -- as edicoes humanas (via nula) e a rotina
  update public.financeiro_lancamentos_v2 set fazenda_id = adm where id in (ids[1], ids[2], ids[4], ids[6]);
  update public.financeiro_lancamentos_v2 set fazenda_id = y where id in (ids[2], ids[5]);
  update public.financeiro_lancamentos_v2 set status_transacao = 'agendado' where id = ids[4];
  perform set_config('app.via', 'outra', true);
  update public.financeiro_lancamentos_v2 set fazenda_id = adm2 where id = ids[6];
  perform set_config('app.via', '', true);
  perform set_config('teste.ids', array_to_string(ids, ','), true);
  perform set_config('teste.faz', concat_ws(',', x, adm, adm2, y), true);
end $fx$;

do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ids uuid[] := string_to_array(current_setting('teste.ids'), ',')::uuid[];
  fz uuid[] := string_to_array(current_setting('teste.faz'), ',')::uuid[];
  x uuid := fz[1]; adm uuid := fz[2]; adm2 uuid := fz[3]; y uuid := fz[4];
  r jsonb; t text; op uuid;
  agora constant text := $q$select string_agg(coalesce(array_position($2, l.fazenda_id)::text, '?'), ',' order by array_position($1, l.id))
    from public.financeiro_lancamentos_v2 l where l.id = any($1)$q$;   -- 1=X 2=ADM 3=ADM2 4=Y
begin
  /* a correcao e' ROTINA do sistema (postgres, sem usuario): a trilha diz "sistema:p155" (P116) — as edicoes humanas do fixture tinham usuario */
  perform set_config('request.jwt.claims', '', true);
  -- T1 simular
  r := public.fn_p155_fazenda_aplicar(c_cli, ids, true);
  select string_agg(array_position(ids, (v->>'id')::uuid)::text, ',' order by array_position(ids, (v->>'id')::uuid)) into t from jsonb_array_elements(r->'voltaram') v;
  if t is distinct from '1,4' then raise exception 'T1 voltaram: % — %', t, r; end if;
  select string_agg(array_position(ids, (v->>'id')::uuid)::text, ',' order by array_position(ids, (v->>'id')::uuid)) into t from jsonb_array_elements(r->'pulados') v;
  if t is distinct from '2,3,5,6' then raise exception 'T1 pulados: % — %', t, r; end if;
  execute agora into t using ids, fz;
  if t is distinct from '2,4,1,2,4,3' then raise exception 'T1 simular gravou: %', t; end if;
  -- T2 aplicar
  r := public.fn_p155_fazenda_aplicar(c_cli, ids, false);
  op := (r->>'operacao')::uuid;
  execute agora into t using ids, fz;
  if t is distinct from '1,4,1,1,4,3' then raise exception 'T2: %', t; end if;
  if (select count(*) from public.fazenda_volta_backup where operacao = op) <> 2 then raise exception 'T2 backup'; end if;
  /* a trilha da volta diz a rotina (no teste tudo e' uma transacao so': o `created_at` e' o mesmo em todas — conta-se, nao se ordena) */
  if (select count(*) from public.audit_log where registro_id = ids[1] and via = 'sistema:p155') <> 1 then raise exception 'T2 via'; end if;
  -- T3 desfazer: L4 mexido depois fica
  update public.financeiro_lancamentos_v2 set fazenda_id = y where id = ids[4];
  r := public.fn_p155_fazenda_desfazer(op);
  if (r->>'voltaram')::int <> 1 or (r->>'mudados_depois_ficaram')::int <> 1 then raise exception 'T3: %', r; end if;
  execute agora into t using ids, fz;
  if t is distinct from '2,4,1,4,4,3' then raise exception 'T3 fazendas: %', t; end if;
  -- T4 fechada
  if has_function_privilege('authenticated', 'public.fn_p155_fazenda_aplicar(uuid,uuid[],boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_p155_fazenda_desfazer(uuid)', 'EXECUTE') then raise exception 'T4 aberta'; end if;
  raise exception 'OK p155_fazenda_volta (T1–T4)';
end $teste$;
rollback;
