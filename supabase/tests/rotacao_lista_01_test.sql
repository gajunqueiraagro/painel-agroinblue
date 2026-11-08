-- ROTACAO-LISTA-01 — teste da 117495. Postgres com as claims do admin; fixture SINTÉTICO no cliente Teste (Fazenda Teste Cana), mês 2027-05,
-- no formato do caso real (BG out/26: P_01 cria com 204 vacas, o lote passou pelo P_02, que fechou o mês VEDADO). Termina em RAISE (ZT0OK).
--   R1 P_01 → P_02 (vedado): o P_02 passa a cria naquele mês, com trilha; a rotação grava os 2 pastos
--   R2 P_01 → P_03 (fechado): o P_03 reabre na mesma transação (linha no log de reaberturas) e entra na rotação
--   R3 salvar de novo com a mesma rotação: nada muda de novo (sem trilha nova, sem reabertura nova)
--   R4 um destino que JÁ estava na rotação e fechou depois: segue recusado como antes (não reabre sozinho)
--   R5 o card de origem vedado segue sem levar o lote a outros pastos
create or replace function pg_temp.rot_teste() returns void language plpgsql as $t$
declare
  v_faz uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f'; v_cli uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_vacas uuid := 'c67f09dc-1cd7-40e3-abe4-fa571156900e';
  p1 uuid; p2 uuid; p3 uuid; f1 uuid; f2 uuid; f3 uuid; r jsonb; v_itens jsonb; v_n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, entra_conciliacao, data_inicio, tipo_uso)
  values (v_faz, v_cli, 'ROT-P_01', 60, 60, true, true, '2026-01-01', 'cria') returning id into p1;
  insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, entra_conciliacao, data_inicio, tipo_uso)
  values (v_faz, v_cli, 'ROT-P_02', 40, 40, true, true, '2026-01-01', 'cria') returning id into p2;
  insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, entra_conciliacao, data_inicio, tipo_uso)
  values (v_faz, v_cli, 'ROT-P_03', 30, 30, true, true, '2026-01-01', 'recria') returning id into p3;
  insert into public.fechamento_pastos (fazenda_id, cliente_id, pasto_id, ano_mes, status, tipo_uso_mes) values (v_faz, v_cli, p1, '2027-05', 'rascunho', 'cria') returning id into f1;
  insert into public.fechamento_pastos (fazenda_id, cliente_id, pasto_id, ano_mes, status, tipo_uso_mes) values (v_faz, v_cli, p2, '2027-05', 'rascunho', 'vedado') returning id into f2;
  insert into public.fechamento_pastos (fazenda_id, cliente_id, pasto_id, ano_mes, status, tipo_uso_mes) values (v_faz, v_cli, p3, '2027-05', 'fechado', 'recria') returning id into f3;
  v_itens := jsonb_build_array(jsonb_build_object('categoria_id', c_vacas, 'quantidade', 204, 'peso_medio_kg', 450, 'origem_dado', 'manual'));

  -- R1 + R2 num gesto: P_01 → P_02 (vedado) e P_03 (fechado)
  r := public.fn_fechamento_pasto_salvar_com_alocacao(f1, '{}'::jsonb, v_itens, array[p1, p2, p3]);
  if (select tipo_uso_mes from public.fechamento_pastos where id = f2) is distinct from 'cria'
     or (select count(*) from public.audit_log where acao = 'vedado_recebe_lote' and registro_id = f2) <> 1 then
    raise exception using errcode = 'ZT001', message = 'R1: o P_02 não passou a cria com trilha: ' || r::text;
  end if;
  if (select status from public.fechamento_pastos where id = f3) <> 'rascunho'
     or (select count(*) from public.fechamento_reaberturas_log where fazenda_id = v_faz and ano_mes = '2027-05' and motivo like 'reaberto para receber o lote do ROT-P_01%ROT-P_03') <> 1 then
    raise exception using errcode = 'ZT001', message = 'R2: o P_03 não reabriu com trilha: ' || r::text;
  end if;
  if (select count(*) from public.fechamento_alocacoes where fechamento_id = f1) <> 3 or jsonb_array_length(r->'destinos_mudados') <> 2 then
    raise exception using errcode = 'ZT001', message = 'R1/R2 alocação: ' || r::text;
  end if;
  -- R3 de novo, a mesma rotação: nada muda de novo
  r := public.fn_fechamento_pasto_salvar_com_alocacao(f1, '{}'::jsonb, v_itens, array[p1, p2, p3]);
  if jsonb_array_length(r->'destinos_mudados') <> 0 or (select count(*) from public.audit_log where acao = 'vedado_recebe_lote' and registro_id = f2) <> 1
     or (select count(*) from public.fechamento_reaberturas_log where fazenda_id = v_faz and ano_mes = '2027-05') <> 1 then
    raise exception using errcode = 'ZT001', message = 'R3: o segundo salvar mudou de novo: ' || r::text;
  end if;
  -- R4 o P_03 (já na rotação) fecha depois: salvar o P_01 segue recusado, sem reabrir sozinho
  update public.fechamento_pastos set status = 'fechado' where id = f3;
  begin
    perform public.fn_fechamento_pasto_salvar_com_alocacao(f1, '{}'::jsonb, v_itens, array[p1, p2, p3]);
    raise exception using errcode = 'ZT001', message = 'R4: reabriu um destino que já estava na rotação';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'O pasto ROT-P_03 está fechado neste mês%' then raise exception using errcode = 'ZT001', message = 'R4 frase: ' || sqlerrm; end if;
  end;
  if (select status from public.fechamento_pastos where id = f3) <> 'fechado' then
    raise exception using errcode = 'ZT001', message = 'R4: o P_03 não está fechado';
  end if;
  -- R5 a origem vedada segue sem levar o lote a outros pastos
  update public.fechamento_pastos set status = 'rascunho' where id = f3;
  begin
    perform public.fn_fechamento_pasto_salvar_com_alocacao(f2, jsonb_build_object('tipo_uso_mes', 'vedado'), '[]'::jsonb, array[p2, p3]);
    raise exception using errcode = 'ZT001', message = 'R5: a origem vedada levou o lote';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%veda%' then raise exception using errcode = 'ZT001', message = 'R5 frase: ' || sqlerrm; end if;
  end;

  raise exception using errcode = 'ZT0OK', message = 'ROTACAO OK — R1 (vedado → cria, trilha) · R2 (fechado reabre, log) · R3 (sem repetir) · R4 (já na rotação segue recusado) · R5 (origem vedada)';
end $t$;
select pg_temp.rot_teste();
