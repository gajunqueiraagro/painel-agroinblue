-- DRE-VARIACAO-EXPLICA-01 fatia 1a — mutacoes do teste `dre_variacao_agio_01_test.sql` (20261028115290, 115300 e 115600 APLICADAS).
-- ATUALIZADO pela REBANHO-AGIO-PROVISORIO-01 (20261028115600): o agio dos totais saiu da janela unica da fn_dre_pecuaria_patrimonio e
-- passou a vir do encadeado (`_fn_rebanho_janela_mes`, mes a mes). As mutacoes M1–M3 agora mexem ali (a janela unica nao alimenta mais o
-- agio: mexer nela sobreviveria); a M4 segue na fn_dre_pecuaria_patrimonio (o valor do mes da V4).
-- Roda como postgres. A funcao de teste abaixo e' copia byte a byte da do _test.sql (gerada dele).
-- Cada mutacao desfaz UM pedaco da regra dentro de um bloco com excecao (subtransacao): o teste roda, o bloco sempre termina em excecao e
-- desfaz a mutacao e o fixture. M0 (sem mutacao) tem de passar; M1–M4 tem de cair num "T… falhou"; no fim as 2 funcoes conferem pelo md5.
-- Termina em RAISE 'OK…'.
set local statement_timeout = '60s';
set local lock_timeout = '2s';

create function pg_temp.teste_dre_agio() returns text language plpgsql as $t$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  r jsonb; g jsonb; d jsonb; m jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  insert into public.valor_rebanho_fechamento_itens (fazenda_id, cliente_id, ano_mes, categoria, quantidade, peso_medio_kg, preco_kg, valor_total_categoria)
  values (c_faz, c_cli, '2030-12', 'desmama_m', 100, 200, 14, 280000), (c_faz, c_cli, '2031-01', 'desmama_m', 100, 210, 14, 294000),
         (c_faz, c_cli, '2031-02', 'desmama_m', 100, 220, 14, 308000), (c_faz, c_cli, '2031-04', 'garrotes', 100, 275, 12, 330000),
         (c_faz, c_cli, '2031-05', 'garrotes', 100, 290, 12, 348000), (c_faz, c_cli, '2031-06', 'garrotes', 100, 300, 12, 360000);
  insert into public.valor_rebanho_realizado_validado (fazenda_id, cliente_id, ano_mes, status, valor_total, cabecas)
  values (c_faz, c_cli, '2030-12', 'validado', 280000, 100), (c_faz, c_cli, '2031-01', 'validado', 294000, 100),
         (c_faz, c_cli, '2031-02', 'validado', 308000, 100), (c_faz, c_cli, '2031-04', 'validado', 330000, 100),
         (c_faz, c_cli, '2031-05', 'validado', 348000, 100), (c_faz, c_cli, '2031-06', 'validado', 360000, 100);
  insert into public.valor_rebanho_mensal (fazenda_id, cliente_id, ano_mes, categoria, preco_kg)
  values (c_faz, c_cli, '2031-02', 'garrotes', 12);
  insert into public.lancamentos (fazenda_id, cliente_id, data, tipo, categoria, categoria_destino, quantidade, peso_medio_kg, cenario, status_operacional)
  values (c_faz, c_cli, '2031-03-15', 'reclassificacao', 'desmama_m', 'garrotes', 100, 250, 'realizado', 'realizado');
  /* o cadastro de mar (sem fechamento validado) e o inicio de abr: o mes do meio da V4 sai dele, sem valor do mes */
  insert into public.zoot_mensal_cache (fazenda_id, cliente_id, ano, mes, ano_mes, cenario, categoria_codigo, categoria_nome, ordem_exibicao,
                                        saldo_inicial, saldo_final, peso_medio_inicial, peso_medio_final)
  values (c_faz, c_cli, 2031, 3, '2031-03', 'realizado', 'desmama_m', 'Desmama M', 2, 100, 0, 220, null),
         (c_faz, c_cli, 2031, 3, '2031-03', 'realizado', 'garrotes', 'Garrotes', 3, 0, 100, null, 260),
         (c_faz, c_cli, 2031, 4, '2031-04', 'realizado', 'garrotes', 'Garrotes', 3, 100, 100, 260, 275);

  r := public.fn_dre_pecuaria_patrimonio(c_cli, c_faz, '2031-01', '2031-06');
  select x into g from jsonb_array_elements(r->'categorias') x where x->>'categoria' = 'garrotes';
  select x into d from jsonb_array_elements(r->'categorias') x where x->>'categoria' = 'desmama_m';

  -- T1 o agio vai na categoria de DESTINO, ao preco do INICIO do mes da troca (garrote R$ 12 da tabela de fev, desmama R$ 14 do fechamento de fev)
  if (g->>'agio')::numeric is distinct from -50000.00 then raise exception 'T1 falhou: agio dos garrotes % (esperado -50000.00)', g->>'agio'; end if;
  if (d->>'agio')::numeric is distinct from 0 then raise exception 'T1 falhou: agio da desmama % (esperado 0: a origem nao leva)', d->>'agio'; end if;
  if (g->>'agio_sem_preco')::boolean then raise exception 'T1 falhou: garrotes sem preco'; end if;

  -- T2 as cabecas e arrobas reclassificadas (entrou no destino, saiu da origem)
  if (g->>'cab_reclass_entrada')::numeric is distinct from 100 or (d->>'cab_reclass_saida')::numeric is distinct from 100
     or (g->>'at_reclass_entrada')::numeric is distinct from 833.33 then
    raise exception 'T2 falhou: garrotes entrada % (% @), desmama saida %', g->>'cab_reclass_entrada', g->>'at_reclass_entrada', d->>'cab_reclass_saida'; end if;

  -- T3 o total (REBANHO-AGIO-PROVISORIO-01): agio -50.000 FORA da producao (vpb 130.000 = a soma dos meses) e DENTRO do efeito (-50.000);
  -- o total econômico segue 80.000
  if (r->'total'->>'agio')::numeric is distinct from -50000.00 or (r->'total'->>'troca_categoria')::numeric is distinct from -50000.00
     or (r->'total'->>'vpb')::numeric is distinct from 130000.00 or (r->'total'->>'efeito')::numeric is distinct from -50000.00
     or (r->'total'->>'vpb')::numeric + (r->'total'->>'efeito')::numeric is distinct from 80000.00 then
    raise exception 'T3 falhou: total agio % troca % vpb % efeito %', r->'total'->>'agio', r->'total'->>'troca_categoria', r->'total'->>'vpb', r->'total'->>'efeito'; end if;

  -- T4 a serie da V4: 7 meses (2030-12 a 2031-06); as pontas pelo fechamento com o valor do mes; o meio pelo cadastro, sem valor do mes
  if jsonb_array_length(r->'meses') <> 7 then raise exception 'T4 falhou: % meses (esperado 7)', jsonb_array_length(r->'meses'); end if;
  select x into m from jsonb_array_elements(r->'meses') x where x->>'ano_mes' = '2031-06';
  if m->>'fonte' is distinct from 'fechamento' or (m->>'v_mes')::numeric is distinct from 360000.00 or (m->>'arrobas')::numeric is distinct from 1000.00 then
    raise exception 'T4 falhou: jun fonte % v_mes % arrobas %', m->>'fonte', m->>'v_mes', m->>'arrobas'; end if;
  select x into m from jsonb_array_elements(r->'meses') x where x->>'ano_mes' = '2031-03';
  if m->>'fonte' is distinct from 'cadastro' or m->'v_mes' is distinct from 'null'::jsonb or (m->>'arrobas')::numeric is distinct from 866.67 then
    raise exception 'T4 falhou: mar fonte % v_mes % arrobas % (esperado cadastro, null e 866.67)', m->>'fonte', m->'v_mes', m->>'arrobas'; end if;

  return 'T1–T4';
end $t$;

do $m$
declare
  mu record; v_msg text; res text := ''; d text;
begin
  if md5(pg_get_functiondef('public._fn_rebanho_janela_mes(uuid,uuid,text)'::regprocedure)) <> '17992d3a686a1aa8a19c4a098de6923e'
     or md5(pg_get_functiondef('public.fn_dre_pecuaria_patrimonio(uuid,uuid,text,text)'::regprocedure)) <> '09eee417a763bec8856732cfd3638928' then
    raise exception 'a migration 20261028115600 nao esta aplicada (ou as funcoes mudaram)'; end if;
  begin
    perform pg_temp.teste_dre_agio();
    raise exception 'M0-PASSOU';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'M0-PASSOU' then raise exception 'M0 falhou: o teste caiu sem mutacao (%)', v_msg; end if;
  end;
  for mu in select * from (values
      ('M1 o agio na ORIGEM', 'public._fn_rebanho_janela_mes(uuid,uuid,text)', 'select e.fazenda_id, e.d categoria, sum(', 'select e.fazenda_id, e.o categoria, sum('),
      ('M2 o sinal trocado (origem - destino)', 'public._fn_rebanho_janela_mes(uuid,uuid,text)', 'e.kg*(rd.pref - ro.pref)', 'e.kg*(ro.pref - rd.pref)'),
      ('M3 o preco do inicio sem a tabela de precos', 'public._fn_rebanho_janela_mes(uuid,uuid,text)', 'coalesce(a.pk, t.pk, b.pk) pref', 'coalesce(a.pk, b.pk) pref'),
      ('M4 o mes pelo cadastro com valor do mes', 'public.fn_dre_pecuaria_patrimonio(uuid,uuid,text,text)', 'case when bool_and(mf.valido) then (select round(sum(coalesce(k.kg,0)*k.pk),2) from mk k where k.am=ms.am) end v_mes', '(select round(sum(coalesce(k.kg,0)*coalesce(k.pk,0)),2) from mk k where k.am=ms.am) v_mes')
    ) x(nome, fn, de, para) loop
    v_msg := null;
    begin
      d := pg_get_functiondef(mu.fn::regprocedure);
      if (length(d)-length(replace(d, mu.de, '')))/length(mu.de) <> 1 then raise exception 'ANCORA % nao casa 1x', mu.nome; end if;
      execute replace(d, mu.de, mu.para);
      perform pg_temp.teste_dre_agio();
      raise exception 'MUTACAO-SOBREVIVEU';
    exception when raise_exception then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg like 'ANCORA%' then raise exception '%', v_msg; end if;
    if v_msg = 'MUTACAO-SOBREVIVEU' or v_msg not like 'T_ falhou%' then raise exception '% NAO caiu (%)', mu.nome, v_msg; end if;
    res := res || chr(10) || mu.nome || ' -> ' || split_part(v_msg, ':', 1);
  end loop;
  if md5(pg_get_functiondef('public._fn_rebanho_janela_mes(uuid,uuid,text)'::regprocedure)) <> '17992d3a686a1aa8a19c4a098de6923e'
     or md5(pg_get_functiondef('public.fn_dre_pecuaria_patrimonio(uuid,uuid,text,text)'::regprocedure)) <> '09eee417a763bec8856732cfd3638928' then
    raise exception 'md5 das funcoes nao voltou'; end if;
  raise exception 'OK dre_variacao_agio_01 mutacoes: M0 passa; M1–M4 caem; as funcoes intactas%', res;
end $m$;
