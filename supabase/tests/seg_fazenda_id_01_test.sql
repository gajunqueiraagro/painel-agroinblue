-- SEG-FAZENDA-ID-01 (118440) — teste. Roda como postgres; termina em RAISE 'OK…'; nada fica no banco.
-- Usuário = um membro REAL, não admin, de um só cliente (claims da transação); as operações são escolhidas pela consulta, nada fixo.
-- G1 as 3 leituras de pasto/rebanho: o usuário recebe 42501 (sem EXECUTE), até com a fazenda nula.
-- G2 oc_lancar_pelo_modal e oc_programar_recebimento com a operação de OUTRO cliente: 42501 antes de ler a operação (prévia inclusive).
-- G3 com a operação do PRÓPRIO cliente a guarda deixa passar: o erro é o da regra seguinte (parcela vazia / valor nulo), nunca 42501.
-- G4 operação que não existe: 42501 para o usuário (não diz se existe).
do $t$
declare
  U uuid; op_propria uuid; op_alheia uuid; v_estado text; v_falhas text := '';
begin
  select m.user_id into U from cliente_membros m
   where m.ativo and m.perfil <> 'admin_agroinblue' and not exists (select 1 from admin_agroinblue a where a.user_id = m.user_id)
     and (select count(distinct m2.cliente_id) from cliente_membros m2 where m2.user_id = m.user_id and m2.ativo) = 1
     and exists (select 1 from zoo_operacoes_comerciais o where o.cliente_id = m.cliente_id and o.modelo_financeiro = 'conta_corrente'
                  and o.tipo_operacao in ('venda', 'compra', 'abate'))
   order by m.user_id limit 1;
  select o.id into op_propria from zoo_operacoes_comerciais o join cliente_membros m on m.cliente_id = o.cliente_id and m.user_id = U and m.ativo
   where o.modelo_financeiro = 'conta_corrente' and o.tipo_operacao in ('venda', 'compra', 'abate') order by o.id limit 1;
  select o.id into op_alheia from zoo_operacoes_comerciais o
   where o.modelo_financeiro = 'conta_corrente' and o.tipo_operacao in ('venda', 'compra', 'abate')
     and o.cliente_id not in (select m.cliente_id from cliente_membros m where m.user_id = U and m.ativo) order by o.id limit 1;
  if U is null or op_propria is null or op_alheia is null then raise exception 'sem fixture'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', U, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- G1
  begin perform * from public.fn_auditoria_consistencia_zoot(null); v_estado := 'passou'; exception when others then v_estado := sqlstate; end;
  if v_estado is distinct from '42501' then v_falhas := v_falhas || format(' G1a=%s', v_estado); end if;
  begin perform * from public.fn_pastos_aplicaveis_mes((select f.id from fazendas f order by f.id limit 1), '2026-10'); v_estado := 'passou';
  exception when others then v_estado := sqlstate; end;
  if v_estado is distinct from '42501' then v_falhas := v_falhas || format(' G1b=%s', v_estado); end if;
  begin perform * from public.fn_saldo_inicial_pasto((select f.id from fazendas f order by f.id limit 1), 2026, 10, 'BOI'); v_estado := 'passou';
  exception when others then v_estado := sqlstate; end;
  if v_estado is distinct from '42501' then v_falhas := v_falhas || format(' G1c=%s', v_estado); end if;

  -- G2 (a prévia: p_simular = true)
  begin perform public.oc_lancar_pelo_modal(op_alheia, 1, 'principal', 'recebimento', null, null, '[]'::jsonb, null, null, null, null, null, true);
    v_estado := 'passou'; exception when others then v_estado := sqlstate; end;
  if v_estado is distinct from '42501' then v_falhas := v_falhas || format(' G2a=%s', v_estado); end if;
  begin perform public.oc_programar_recebimento(op_alheia, 1, null, null, null, true); v_estado := 'passou';
  exception when others then v_estado := sqlstate; end;
  if v_estado is distinct from '42501' then v_falhas := v_falhas || format(' G2b=%s', v_estado); end if;

  -- G3
  begin perform public.oc_lancar_pelo_modal(op_propria, 1, 'principal', 'recebimento', null, null, '[]'::jsonb, null, null, null, null, null, true);
    v_estado := 'passou'; exception when others then v_estado := sqlstate; end;
  if v_estado is null or v_estado = '42501' then v_falhas := v_falhas || format(' G3a=%s', v_estado); end if;
  begin perform public.oc_programar_recebimento(op_propria, 1, null, null, null, true); v_estado := 'passou';
  exception when others then v_estado := sqlstate; end;
  if v_estado is null or v_estado = '42501' then v_falhas := v_falhas || format(' G3b=%s', v_estado); end if;

  -- G4
  begin perform public.oc_programar_recebimento(gen_random_uuid(), 1, null, null, null, true); v_estado := 'passou';
  exception when others then v_estado := sqlstate; end;
  if v_estado is distinct from '42501' then v_falhas := v_falhas || format(' G4=%s', v_estado); end if;

  execute 'reset role';
  if v_falhas <> '' then raise exception 'FALHOU SEG-FAZENDA-ID-01:%', v_falhas; end if;
  raise exception 'OK SEG-FAZENDA-ID-01: G1–G4 (nada gravado)';
end $t$;
