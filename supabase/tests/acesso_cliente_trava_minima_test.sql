-- ACESSO-CLIENTE-TRAVA-01 · teste da 115280. Numa query só, termina em RAISE 'OK…' (nada fica). Fixture: cliente Teste (43f32d07); papéis montados
-- DENTRO da transação com usuários reais (desfeito no RAISE): G = gestor (não admin), L = só leitura, A = admin AgroinBlue.
do $$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  G constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56'; L constant uuid := '76f50f2e-015e-449c-b6b0-ca5ab71e05e4'; A constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_faz uuid; pP uuid; pG uuid; gX uuid; vX int; n int; r jsonb; n_leitura int; n_apagar int; n_trilha int;
begin
  select id into strict v_faz from public.fazendas where cliente_id = c_cli and nome = 'Fazenda Teste Cana';
  update public.cliente_membros set perfil = 'leitura' where user_id = L and ativo;
  insert into public.cliente_membros (user_id, cliente_id, perfil, ativo) values (L, c_cli, 'leitura', true), (G, c_cli, 'gestor_cliente', true);
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values (v_faz, c_cli, 'TESTE-NJ P', 10, 'cria', true) returning id into pP;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, nome_original, geojson)
  values (v_faz, c_cli, 'outra', 'TESTE-NJ X', '{"type":"Polygon","coordinates":[[[-48.50,-15.60],[-48.49,-15.60],[-48.49,-15.59],[-48.50,-15.59],[-48.50,-15.60]]]}')
  returning id, versao into gX, vX;

  -- T1 quem só vê: vê, não grava (nem direto, nem pela RPC)
  perform set_config('request.jwt.claims', json_build_object('sub', L, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.pastos where cliente_id = c_cli;
  if n = 0 then raise exception 'T1 leitura não vê os pastos'; end if;
  begin insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values (v_faz, c_cli, 'TESTE-NJ L', 1, 'cria', true);
    raise exception 'T1 leitura gravou';
  exception when sqlstate '42501' then if sqlerrm <> 'Seu acesso é só de leitura: nada foi gravado.' then raise exception 'T1 frase: %', sqlerrm; end if; end;
  begin perform public.fn_pasto_renomear(pP, 'TESTE-NJ P2', false); raise exception 'T1 leitura renomeou pela RPC';
  exception when sqlstate '42501' then if sqlerrm <> 'Seu acesso é só de leitura: nada foi gravado.' then raise exception 'T1 frase RPC: %', sqlerrm; end if; end;

  -- T2 gestor: grava com trilha (quem, antes, depois); apagar pela API recusa
  perform set_config('request.jwt.claims', json_build_object('sub', G, 'role', 'authenticated')::text, true);
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values (v_faz, c_cli, 'TESTE-NJ G', 1, 'cria', true) returning id into pG;
  update public.pastos set observacoes = 'mexi' where id = pG;
  execute 'reset role';
  if (select count(*) from public.audit_log where registro_id = pG and tabela_origem = 'pastos' and usuario_id = G and modulo = 'cadastros') <> 2
     or not exists (select 1 from public.audit_log where registro_id = pG and acao = 'editou' and dados_anteriores->>'observacoes' is null and dados_novos->>'observacoes' = 'mexi') then
    raise exception 'T2 trilha do pasto';
  end if;
  execute 'set local role authenticated';
  begin delete from public.pastos where id = pG; raise exception 'T2 gestor apagou pela API';
  exception when sqlstate '42501' then if sqlerrm not like 'Apagar de vez (pastos) é só pela equipe%' then raise exception 'T2 frase: %', sqlerrm; end if; end;
  -- T3a o escritor do mapa é só do admin desde a 117170 (Code 6): o gestor recebe a trava do mapa, nada apagado
  begin r := public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'apagar', 'motivo', 'teste NJ', 'remover', jsonb_build_array(jsonb_build_object('id', gX, 'versao', vX))), false);
    raise exception 'T3a gestor passou no escritor do mapa: %', r;
  exception when sqlstate '42501' then if sqlerrm not like 'Por enquanto só o administrador do AGROinBLUE edita o mapa%' then raise exception 'T3a frase: %', sqlerrm; end if; end;
  -- T3b um escritor SECURITY DEFINER (dono postgres) chamado pelo gestor apaga: o gatilho olha o current_user, não o papel da sessão.
  --     Escritor de teste criado aqui (some no RAISE final).
  execute 'reset role';
  create function public._teste_nj_apagar_geo(p uuid) returns void language sql security definer set search_path = public
    as 'delete from public.fazenda_geometrias where id = p';
  grant execute on function public._teste_nj_apagar_geo(uuid) to authenticated;
  execute 'set local role authenticated';
  perform public._teste_nj_apagar_geo(gX);
  if exists (select 1 from public.fazenda_geometrias where id = gX) then raise exception 'T3b o escritor DEFINER não apagou'; end if;
  -- T4 admin apaga
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  delete from public.pastos where id = pG;
  if exists (select 1 from public.pastos where id = pG) then raise exception 'T4 admin não apagou'; end if;
  execute 'reset role';
  if not exists (select 1 from public.audit_log where registro_id = pG and acao = 'excluiu' and usuario_id = A) then raise exception 'T4 sem trilha do apagar'; end if;

  select count(*) into n_leitura from pg_trigger where tgname = 'trg_leitura_nao_grava';
  select count(*) into n_apagar from pg_trigger where tgname = 'trg_apagar_so_pela_equipe';
  select count(*) into n_trilha from pg_trigger where tgname = 'trg_trilha_cadastro';
  raise exception 'OK ACESSO-CLIENTE-TRAVA-01 115280: T1–T4 (leitura vê e não grava nem pela RPC; gestor grava com trilha e não apaga pela API; escritor com trilha apaga; admin apaga com trilha) — gatilhos: leitura % · apagar % · trilha %', n_leitura, n_apagar, n_trilha;
end $$;
