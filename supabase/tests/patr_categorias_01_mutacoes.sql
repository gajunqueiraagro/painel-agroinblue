set local statement_timeout = '25s';
set local lock_timeout = '2s';
create function pg_temp.teste() returns text language plpgsql as $f$
declare
  cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_old uuid := (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'equipamentos_informatica');
  c_eq uuid := (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'equipamentos');
  c_maq uuid := (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'maquinas');
  r jsonb; b1 uuid; b2 uuid; b3 uuid; bj jsonb; n int; cont_antes numeric; aq_antes numeric; itens jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub": "7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e", "role": "authenticated"}', true);
  perform set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);
  execute 'set local role authenticated';
  -- fixture: 3 bens pelo escritor oficial
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', cli, 'fazenda_id', faz, 'categoria_id', c_old, 'descricao', 'TST motobomba',
         'situacao', 'em_formacao', 'atividade', 'compartilhado', 'origem_valor', 'sem_lancamento', 'valor_sem_lancamento', 1000, 'numero_proprio', 'TST-1'), false, null);
  b1 := (r->>'id')::uuid;
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', cli, 'fazenda_id', faz, 'categoria_id', c_old, 'descricao', 'TST cortador',
         'situacao', 'em_formacao', 'atividade', 'compartilhado', 'origem_valor', 'sem_lancamento', 'valor_sem_lancamento', 2000, 'numero_proprio', 'TST-2'), false, null);
  b2 := (r->>'id')::uuid;
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', cli, 'fazenda_id', faz, 'categoria_id', c_maq, 'descricao', 'TST trator',
         'situacao', 'em_formacao', 'atividade', 'compartilhado', 'origem_valor', 'sem_lancamento', 'valor_sem_lancamento', 3000, 'numero_proprio', 'TST-3'), false, null);
  b3 := (r->>'id')::uuid;
  select sum(valor_contabil), sum(aquisicao) into cont_antes, aq_antes from public.fn_patrimonio_lista(cli, null, null);
  itens := jsonb_build_array(
    jsonb_build_object('numero_proprio', 'TST-1', 'data', '2026-11-03', 'valor_total', 800, 'fonte', 'pesquisa', 'criterio', 'FIPE', 'confianca', 'baixa',
                       'fontes', jsonb_build_array('https://a.b/1', 'https://a.b/2')),
    jsonb_build_object('numero_proprio', 'TST-2', 'data', '2026-11-03', 'valor_total', 1500, 'fonte', 'pesquisa', 'confianca', 'media'),
    jsonb_build_object('numero_proprio', 'TST-3', 'data', '2026-11-03', 'valor_total', 2500, 'fonte', 'pesquisa', 'confianca', 'alta'));

  -- T4 antes da troca: 2 recusas (categoria sem mercado); gravar = nada
  r := public.fn_patrimonio_avaliacoes_lote(cli, itens, 'TST lote', true);
  if (r->>'ok')::boolean or jsonb_array_length(r->'recusas') <> 2 or (r->>'n')::int <> 1 then raise exception 'T4a %', r; end if;
  begin perform public.fn_patrimonio_avaliacoes_lote(cli, itens, 'TST lote', false); raise exception 'T4b gravou com recusa';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Nada gravado: 2 recusa%' then raise exception 'T4b %', sqlerrm; end if; end;
  if exists (select 1 from public.patrimonio_avaliacoes where cliente_id = cli and lote = 'TST lote') then raise exception 'T4c'; end if;

  -- T2 recusas da troca
  begin perform public.fn_patrimonio_bens_reclassificar(jsonb_build_array(jsonb_build_object('bem_id', b1, 'categoria', 'equipamentos')), ' ', true);
        raise exception 'T2a'; exception when sqlstate 'P0001' then null; end;
  begin perform public.fn_patrimonio_bens_reclassificar(null, 'x', true); raise exception 'T2b';
  exception when sqlstate 'P0001' then if sqlerrm <> 'Nenhum bem para trocar de categoria.' then raise exception 'T2b %', sqlerrm; end if; end;
  begin perform public.fn_patrimonio_bens_reclassificar(jsonb_build_array(jsonb_build_object('bem_id', b3, 'categoria', 'maquinas')), 'x', true);
        raise exception 'T2c'; exception when sqlstate 'P0001' then null; end;
  begin perform public.fn_patrimonio_bens_reclassificar(jsonb_build_array(jsonb_build_object('bem_id', b1, 'categoria', 'nao_existe')), 'x', true);
        raise exception 'T2d'; exception when sqlstate 'P0001' then null; end;

  -- T1 troca pela RPC (b1)
  r := public.fn_patrimonio_bens_reclassificar(jsonb_build_array(jsonb_build_object('bem_id', b1, 'categoria', 'equipamentos')), 'TST motivo', true);
  if (r->>'n')::int <> 1 or (select categoria_id from public.patrimonio_bens where id = b1) <> c_old
     or exists (select 1 from public.patrimonio_bem_trilha where bem_id = b1) then raise exception 'T1a %', r; end if;
  r := public.fn_patrimonio_bens_reclassificar(jsonb_build_array(jsonb_build_object('bem_id', b1, 'categoria', 'equipamentos')), 'TST motivo', false);
  if (select categoria_id from public.patrimonio_bens where id = b1) <> c_eq
     or (select count(*) from public.patrimonio_bem_trilha where bem_id = b1 and acao = 'troca_categoria' and motivo = 'TST motivo'
           and antes->>'categoria' = 'equipamentos_informatica' and depois->>'categoria' = 'equipamentos'
           and por = '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e') <> 1
     or (select codigo from public.patrimonio_bens where id = b1) not like 'EQP-%' then raise exception 'T1b'; end if;

  -- T3 troca pela ficha (b2)
  select to_jsonb(x) into bj from public.patrimonio_bens x where x.id = b2;
  perform public.fn_patrimonio_bem_salvar(bj || jsonb_build_object('categoria_id', c_eq), false, null);
  if (select count(*) from public.patrimonio_bem_trilha where bem_id = b2 and acao = 'troca_categoria'
        and motivo = 'troca de categoria pela ficha do bem' and depois->>'categoria' = 'equipamentos') <> 1 then raise exception 'T3a'; end if;
  select to_jsonb(x) into bj from public.patrimonio_bens x where x.id = b2;
  perform public.fn_patrimonio_bem_salvar(bj || jsonb_build_object('descricao', 'TST cortador 2'), false, null);
  if (select count(*) from public.patrimonio_bem_trilha where bem_id = b2) <> 1 then raise exception 'T3b'; end if;

  -- T4 depois da troca: prévia limpa, nada gravado
  r := public.fn_patrimonio_avaliacoes_lote(cli, itens, 'TST lote', true);
  if not (r->>'ok')::boolean or (r->>'n')::int <> 3 or (r->>'total')::numeric <> 4800
     or (r->'por_categoria'->>'Equipamentos')::numeric <> 2300 or (r->'por_categoria'->>'Máquinas')::numeric <> 2500
     or exists (select 1 from public.patrimonio_avaliacoes where cliente_id = cli and lote = 'TST lote') then raise exception 'T4d %', r; end if;

  -- T5 gravado
  perform public.fn_patrimonio_avaliacao_salvar(b1, jsonb_build_object('data', '2026-10-31', 'fonte', 'antiga', 'valor_total', 999), false);
  r := public.fn_patrimonio_avaliacoes_lote(cli, itens, 'TST lote', false);
  if (select count(*) from public.patrimonio_avaliacoes where cliente_id = cli and lote = 'TST lote') <> 3
     or (select confianca || '|' || criterio || '|' || cardinality(fontes) || '|' || criado_por from public.patrimonio_avaliacoes
          where bem_id = b1 and lote = 'TST lote') <> 'baixa|FIPE|2|7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e' then raise exception 'T5a'; end if;
  if (select mercado_valor from public.fn_patrimonio_lista(cli, null, null) where bem_id = b1) <> 800
     or (select count(*) from public.patrimonio_avaliacoes where bem_id = b1 and cancelado_em is null) <> 2 then raise exception 'T5b'; end if;
  begin perform public.fn_patrimonio_avaliacoes_lote(cli, itens, 'TST lote', true); raise exception 'T5c';
  exception when sqlstate 'P0001' then if sqlerrm not like 'O lote%já foi gravado%' then raise exception 'T5c %', sqlerrm; end if; end;

  -- T6 recusas do lote
  r := public.fn_patrimonio_avaliacoes_lote(cli, jsonb_build_array(
         jsonb_build_object('numero_proprio', 'TST-1', 'data', '2026-11-03', 'valor_total', 1, 'fonte', 'x', 'fontes', jsonb_build_array('a.b')),
         jsonb_build_object('numero_proprio', 'TST-3', 'data', '2026-11-03', 'valor_total', 1, 'fonte', 'x', 'confianca', 'otima'),
         jsonb_build_object('numero_proprio', 'NAO-1', 'data', '2026-11-03', 'valor_total', 1, 'fonte', 'x'),
         jsonb_build_object('numero_proprio', 'TST-2', 'data', '2026-11-03', 'valor_total', 1, 'fonte', 'x'),
         jsonb_build_object('numero_proprio', 'TST-2', 'data', '2026-11-03', 'valor_total', 1, 'fonte', 'x')), 'TST 2', true);
  if jsonb_array_length(r->'recusas') <> 4 or (r->>'n')::int <> 1 then raise exception 'T6a %', r; end if;
  begin perform public.fn_patrimonio_avaliacoes_lote(cli, null, 'TST 3', true); raise exception 'T6b';
  exception when sqlstate 'P0001' then null; end;

  -- T8 aquisição e contábil intactos
  if (select sum(valor_contabil) from public.fn_patrimonio_lista(cli, null, null)) is distinct from cont_antes
     or (select sum(aquisicao) from public.fn_patrimonio_lista(cli, null, null)) is distinct from aq_antes then raise exception 'T8'; end if;

  perform set_config('request.jwt.claims', '{"sub": "a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9", "role": "authenticated"}', true);
  perform set_config('request.jwt.claim.sub', 'a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9', true);
  begin perform public.fn_patrimonio_avaliacoes_lote('43f32d07-dba8-4670-900c-bf645440c04a',
          jsonb_build_array(jsonb_build_object('numero_proprio', 'TST-3')), 'z', true); raise exception 'T7a';
  exception when sqlstate '42501' then null; end;
  begin perform public.fn_patrimonio_bens_reclassificar(jsonb_build_array(jsonb_build_object('bem_id', b3,
          'categoria', 'equipamentos')), 'x', true); raise exception 'T7b';
  exception when sqlstate '42501' then null; end;
  execute 'reset role';
  return 'OK';
end $f$;
do $m$
declare m text[]; res jsonb := '{}'::jsonb; d text; k int;
begin
  begin
    res := res || jsonb_build_object('M0 sem mutação', pg_temp.teste());
    raise exception 'desfaz M0';
  exception when others then if sqlerrm <> 'desfaz M0' then raise exception 'M0 falhou: %', sqlerrm; end if;
  end;
  foreach m slice 1 in array array[
array[$q$M1 troca: sem a guarda de lista nula$q$,$q$public.fn_patrimonio_bens_reclassificar(jsonb,text,boolean)$q$,$q$if p_itens is null or jsonb_typeof$q$,$q$if jsonb_typeof$q$],
array[$q$M2 troca: trilha com outro motivo$q$,$q$public.fn_patrimonio_bens_reclassificar(jsonb,text,boolean)$q$,$q$btrim(p_motivo), auth.uid());$q$,$q$btrim(p_motivo) || ' M', auth.uid());$q$],
array[$q$M3 ficha: troca sem trilha$q$,$q$public.fn_patrimonio_bem_salvar(jsonb,boolean,text)$q$,$q$if o.categoria_id <> n.categoria_id then
    insert$q$,$q$if false then
    insert$q$],
array[$q$M4 lote: grava mesmo com recusa$q$,$q$public.fn_patrimonio_avaliacoes_lote(uuid,jsonb,text,boolean)$q$,$q$if cardinality(v_erros) > 0 and not p_simular then$q$,$q$if false then$q$],
array[$q$M5 lote: sem a trava do lote repetido$q$,$q$public.fn_patrimonio_avaliacoes_lote(uuid,jsonb,text,boolean)$q$,$q$and a.lote = v_lote and$q$,$q$and a.lote = v_lote || 'x' and$q$],
array[$q$M6 extras: aceita URL sem http$q$,$q$public._fn_patrimonio_avaliacao_extras(jsonb)$q$,$q$if f !~* '^https?://' then$q$,$q$if false then$q$],
array[$q$M7 lote: sem a guarda do cliente$q$,$q$public.fn_patrimonio_avaliacoes_lote(uuid,jsonb,text,boolean)$q$,$q$or not coalesce(public.tenant_ok(p_cliente), false) then$q$,$q$or false then$q$],
array[$q$M8 lote: categoria sem mercado passa$q$,$q$public.fn_patrimonio_avaliacoes_lote(uuid,jsonb,text,boolean)$q$,$q$if not c.tem_mercado then v_erros$q$,$q$if false then v_erros$q$]
  ] loop
    begin
      d := pg_get_functiondef(m[2]::regprocedure);
      k := (length(d) - length(replace(d, m[3], ''))) / length(m[3]);
      if k <> 1 then raise exception 'ANCORA % vezes', k; end if;
      execute replace(d, m[3], m[4]);
      perform pg_temp.teste();
      raise exception 'SOBREVIVEU';
    exception when others then res := res || jsonb_build_object(m[1], sqlerrm);
    end;
  end loop;
  raise exception 'OK MUTACOES %', res;
end $m$;
