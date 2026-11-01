-- LOTACAO-REF-01 · F0 TIP — teste (roda depois da migration 20261028115180, numa query só; termina em RAISE 'OK…', nada fica).
-- T1 as duas listas · T2 nenhuma das 4 funções tem a lista escrita à mão · T3 um pasto 'tip' (sintético no cliente Teste, 2031-01)
-- entra no P2 (o mês passa a exigir rebanho) e na natureza patrimonial "pecuaria_produtiva" · T4 constantes abertas a quem lê.
do $$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; v_pasto uuid; v_st jsonb; v_nat text; f text;
begin
  -- T1
  if public._fn_tipos_uso_com_rebanho() <> array['cria','recria','engorda','tip']
     or public._fn_tipos_uso_pecuaria() <> array['cria','recria','engorda','tip','vedado','reforma_pecuaria'] then
    raise exception 'T1 listas: % / %', public._fn_tipos_uso_com_rebanho(), public._fn_tipos_uso_pecuaria();
  end if;
  -- T2
  foreach f in array array['public._fn_status_pilares_fechamento(uuid,text)', 'public.fn_dre_pecuaria(uuid,text,text,text)',
                           'public.fn_gerar_area_de_snapshot(uuid)', 'public.fn_natureza_patrimonial_fazenda(uuid)'] loop
    if pg_get_functiondef(f::regprocedure) like '%''engorda''%' then raise exception 'T2 % ainda tem a lista escrita à mão', f; end if;
  end loop;
  -- T3
  select id into strict v_faz from public.fazendas where cliente_id = c_cli and nome = 'Fazenda Teste Cana';
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo)
  values (v_faz, c_cli, 'TESTE-TIP', 10, 'tip', true) returning id into v_pasto;
  insert into public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status, tipo_uso_mes)
  values (v_pasto, v_faz, c_cli, '2031-01', 'rascunho', 'tip');
  v_st := public._fn_status_pilares_fechamento(v_faz, '2031-01');
  if v_st->'p2_valor_rebanho'->>'status' = 'nao_aplicavel' then raise exception 'T3 o pasto tip não entrou no P2: %', v_st; end if;
  -- a natureza exige usuário (auth.uid): o membro ativo do cliente Teste
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.cliente_membros
    where cliente_id = c_cli and ativo order by created_at limit 1), 'role', 'authenticated')::text, true);
  select natureza_patrimonial into v_nat from public.fn_natureza_patrimonial_fazenda(v_faz) where pasto_id = v_pasto;
  if v_nat is distinct from 'pecuaria_produtiva' then raise exception 'T3 natureza do pasto tip: %', v_nat; end if;
  -- T4
  if not has_function_privilege('authenticated', 'public._fn_tipos_uso_pecuaria()', 'execute')
     or has_function_privilege('anon', 'public._fn_tipos_uso_pecuaria()', 'execute') then
    raise exception 'T4 permissões';
  end if;
  raise exception 'OK LOTACAO-REF-01 F0 TIP: T1–T4 (p2 do mês tip = %)', v_st->'p2_valor_rebanho'->>'status';
end $$;
