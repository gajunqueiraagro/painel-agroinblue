-- FECH-AJUSTE-INVENTARIO-01 · B1 — mutações do teste `fech_ajuste_01_tipo_test.sql` (migration 20261028116180 aplicada).
-- Roda como postgres. A função de teste abaixo é cópia byte a byte da do _test.sql (gerada dele).
-- Cada mutação troca um objeto dentro de um bloco com exceção (subtransação): o teste roda, o bloco sempre termina em exceção e
-- desfaz a mutação e o fixture. M0 (sem mutação) tem de passar; M1–M5 têm de cair no teste que guarda o trecho. Termina em RAISE 'OK…'.
set local statement_timeout = '60s';
set local lock_timeout = '2s';

create function pg_temp.teste_ajuste_tipo() returns text language plpgsql as $t$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  r record; v record; v_msg text;
begin
  -- fixture: 50 Desmama M comprados em jan/2031 (200 kg)
  insert into public.lancamentos (fazenda_id, cliente_id, data, tipo, categoria, quantidade, peso_medio_kg, cenario, status_operacional)
  values (c_faz, c_cli, '2031-01-10', 'compra', 'desmama_m', 50, 200, 'realizado', 'realizado');

  -- T1 a CHECK aceita os dois tipos novos e segue recusando tipo desconhecido
  insert into public.lancamentos (fazenda_id, cliente_id, data, tipo, categoria, quantidade, peso_medio_kg, cenario, status_operacional)
  values (c_faz, c_cli, '2031-02-28', 'ajuste_entrada', 'desmama_m', 10, 210, 'realizado', 'realizado');
  insert into public.lancamentos (fazenda_id, cliente_id, data, tipo, categoria, quantidade, peso_medio_kg, cenario, status_operacional)
  values (c_faz, c_cli, '2031-03-31', 'ajuste_saida', 'desmama_m', 5, 220, 'realizado', 'realizado');
  begin
    insert into public.lancamentos (fazenda_id, cliente_id, data, tipo, categoria, quantidade, peso_medio_kg, cenario, status_operacional)
    values (c_faz, c_cli, '2031-03-31', 'ajuste', 'desmama_m', 5, 220, 'realizado', 'realizado');
    raise exception 'T1b falhou: tipo "ajuste" (sem sentido) foi aceito';
  exception when check_violation then null;
  end;

  -- T2a ajuste sem peso médio é recusado
  v_msg := null;
  begin
    insert into public.lancamentos (fazenda_id, cliente_id, data, tipo, categoria, quantidade, peso_medio_kg, cenario, status_operacional)
    values (c_faz, c_cli, '2031-04-30', 'ajuste_entrada', 'desmama_m', 3, null, 'realizado', 'realizado');
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is null then raise exception 'T2a falhou: ajuste sem peso foi aceito'; end if;
  if v_msg not like '%peso médio%' then raise exception 'T2a falhou: recusa errada (%)', v_msg; end if;
  -- T2b ajuste com quantidade 0 é recusado
  v_msg := null;
  begin
    insert into public.lancamentos (fazenda_id, cliente_id, data, tipo, categoria, quantidade, peso_medio_kg, cenario, status_operacional)
    values (c_faz, c_cli, '2031-04-30', 'ajuste_saida', 'desmama_m', 0, 200, 'realizado', 'realizado');
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is null then raise exception 'T2b falhou: ajuste com 0 cabeças foi aceito'; end if;
  if v_msg not like '%quantidade > 0%' then raise exception 'T2b falhou: recusa errada (%)', v_msg; end if;
  -- T2c ajuste na META é recusado (META x REALIZADO). Como admin real: senão a trava "META só para admin" recusa antes.
  -- (quando a recusa vem, o set_config é desfeito junto com o bloco)
  v_msg := null;
  begin
    perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
    perform set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);
    insert into public.lancamentos (fazenda_id, cliente_id, data, tipo, categoria, quantidade, peso_medio_kg, cenario, status_operacional)
    values (c_faz, c_cli, '2031-04-30', 'ajuste_entrada', 'desmama_m', 3, 200, 'meta', null);
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is null then raise exception 'T2c falhou: ajuste na meta foi aceito'; end if;
  if v_msg not like '%só do realizado%' then raise exception 'T2c falhou: recusa errada (%)', v_msg; end if;

  -- T3 o estoque mensal conta a sobra como entrada externa, com o peso (fev: 50 + 10)
  select * into r from public._fn_zoot_categoria_mensal(c_faz, 2031, 'realizado') z where z.categoria_codigo = 'desmama_m' and z.mes = 2;
  if r.saldo_sistema is distinct from 60 or r.entradas_externas is distinct from 10 or r.peso_entradas_externas is distinct from 2100.00 then
    raise exception 'T3 falhou: fev saldo % entradas % peso %', r.saldo_sistema, r.entradas_externas, r.peso_entradas_externas;
  end if;
  if r.producao_biologica is distinct from 0.00 then
    raise exception 'T3b falhou: a sobra virou produção (%)', r.producao_biologica;
  end if;
  -- T4 e a falta como saída externa (mar: 60 − 5)
  select * into r from public._fn_zoot_categoria_mensal(c_faz, 2031, 'realizado') z where z.categoria_codigo = 'desmama_m' and z.mes = 3;
  if r.saldo_sistema is distinct from 55 or r.saidas_externas is distinct from 5 or r.peso_saidas_externas is distinct from 1100.00 then
    raise exception 'T4 falhou: mar saldo % saídas % peso %', r.saldo_sistema, r.saidas_externas, r.peso_saidas_externas;
  end if;

  -- T5 a view (lida pelas telas) dá o mesmo que a função nos 12 meses (uma leitura só da view: ela custa ~3 s)
  select count(*) filter (where w.mes is null) as sem_par,
         count(*) filter (where w.saldo_final is distinct from z.saldo_final or w.entradas_externas is distinct from z.entradas_externas
                             or w.saidas_externas is distinct from z.saidas_externas or w.peso_total_final is distinct from z.peso_total_final) as diferentes,
         count(*) as n
    into r
    from public._fn_zoot_categoria_mensal(c_faz, 2031, 'realizado') z
    left join (select * from public.vw_zoot_categoria_mensal x
                where x.fazenda_id = c_faz and x.ano = 2031 and x.cenario = 'realizado' and x.categoria_codigo = 'desmama_m') w
      on w.mes = z.mes
   where z.categoria_codigo = 'desmama_m';
  if r.n <> 12 or r.sem_par <> 0 or r.diferentes <> 0 then
    raise exception 'T5 falhou: % meses, % sem par na view, % diferentes', r.n, r.sem_par, r.diferentes;
  end if;

  return 'T1–T5';
end $t$;

create temp table _mut(id text, esperado text, mutacao text, resultado text) on commit drop;
insert into _mut (id, esperado, mutacao) values
 ('M0', 'passa', null),
 ('M1', 'T2a', 'validate: sem a exigência de peso médio'),
 ('M2', 'T2c', 'validate: sem a regra "só do realizado"'),
 ('M3', 'T3',  'função: sem ajuste_entrada nas entradas'),
 ('M4', 'T4',  'função: sem ajuste_saida nas saídas'),
 ('M5', 'T5',  'view: sem ajuste_entrada nas entradas');

do $$
declare
  m record; v_msg text; v_def text; v_orig text;
  m_val0 constant text := md5(pg_get_functiondef('public.validate_lancamento_campos_por_tipo()'::regprocedure));
  m_fn0 constant text := md5(pg_get_functiondef('public._fn_zoot_categoria_mensal(uuid,integer,text)'::regprocedure));
  m_vw0 constant text := md5(pg_get_viewdef('public.vw_zoot_categoria_mensal'::regclass));
  procedure_falhas text := '';
begin
  for m in select * from _mut order by id loop
    begin
      if m.id = 'M1' then
        v_orig := pg_get_functiondef('public.validate_lancamento_campos_por_tipo()'::regprocedure);
        v_def := v_orig;
        v_def := replace(v_def, E'coalesce(NEW.peso_medio_kg, 0) <= 0 THEN\n        RAISE EXCEPTION ''Ajuste de inventário deve informar',
                                E'false THEN\n        RAISE EXCEPTION ''Ajuste de inventário deve informar');
        execute v_def;
      elsif m.id = 'M2' then
        v_orig := pg_get_functiondef('public.validate_lancamento_campos_por_tipo()'::regprocedure);
        v_def := v_orig;
        v_def := replace(v_def, $x$IF NEW.tipo IN ('ajuste_entrada', 'ajuste_saida') AND NEW.cenario IS DISTINCT FROM 'realizado' THEN$x$, 'IF false THEN');
        execute v_def;
      elsif m.id = 'M3' then
        v_orig := pg_get_functiondef('public._fn_zoot_categoria_mensal(uuid,integer,text)'::regprocedure);
        v_def := replace(v_orig, $x$,'ajuste_entrada']$x$, ']');
        execute v_def;
      elsif m.id = 'M4' then
        v_orig := pg_get_functiondef('public._fn_zoot_categoria_mensal(uuid,integer,text)'::regprocedure);
        v_def := replace(v_orig, $x$,'ajuste_saida']$x$, ']');
        execute v_def;
      elsif m.id = 'M5' then
        v_orig := pg_get_viewdef('public.vw_zoot_categoria_mensal'::regclass);
        v_def := replace(v_orig, $x$, 'ajuste_entrada'::text]$x$, ']');
        execute 'create or replace view public.vw_zoot_categoria_mensal with (security_invoker = true) as ' || v_def;
      end if;
      if m.id <> 'M0' and v_def is not distinct from v_orig then
        raise exception 'mutação % não montou (o texto não mudou)', m.id;
      end if;
      perform pg_temp.teste_ajuste_tipo();
      raise exception 'SOBREVIVEU';
    exception when others then
      get stacked diagnostics v_msg = message_text;
      update _mut set resultado = v_msg where id = m.id;
    end;
    v_def := null; v_orig := null;
  end loop;
  -- a mutação foi desfeita junto com cada bloco
  if md5(pg_get_functiondef('public.validate_lancamento_campos_por_tipo()'::regprocedure)) <> m_val0
     or md5(pg_get_functiondef('public._fn_zoot_categoria_mensal(uuid,integer,text)'::regprocedure)) <> m_fn0
     or md5(pg_get_viewdef('public.vw_zoot_categoria_mensal'::regclass)) <> m_vw0 then
    raise exception 'MUTAÇÕES: um objeto não voltou ao md5 de antes';
  end if;
  select string_agg(id || ' (' || esperado || '): ' || coalesce(resultado, '?'), ' | ' order by id) into procedure_falhas
    from _mut
   where not ((id = 'M0' and resultado = 'SOBREVIVEU') or (id <> 'M0' and resultado like esperado || ' falhou%'));
  if procedure_falhas is not null then
    raise exception 'MUTAÇÕES com problema: %', procedure_falhas;
  end if;
  raise exception 'OK fech_ajuste_01_tipo_mutacoes: M0 passa; %',
    (select string_agg(id || '→' || esperado, ' · ' order by id) from _mut where id <> 'M0');
end $$;
