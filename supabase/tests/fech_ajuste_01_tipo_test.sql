-- FECH-AJUSTE-INVENTARIO-01 · B1 — teste do tipo "Ajuste de inventário" (migration 20261028116180).
-- Roda como postgres; fixture sintético no cliente Teste (43f32d07), ano 2031 (sem dado nenhum); termina em RAISE 'OK…' (nada fica).
-- O corpo dos testes é a função pg_temp.teste_ajuste_tipo(), a mesma que o arquivo de mutações chama.
-- As recusas se decidem FORA do bloco que as pega: a frase de falha do teste nunca pode casar com a recusa esperada (pego pela M1).
set local statement_timeout = '10s';
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

do $$
declare v text;
begin
  v := pg_temp.teste_ajuste_tipo();
  raise exception 'OK fech_ajuste_01_tipo: % passaram (nada fica no banco)', v;
end $$;
