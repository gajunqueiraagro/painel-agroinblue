-- PR-CONC-STATUS-SALDO-01a — o status do mes e' o SALDO; o extrato importado e' a 2a prova (avisos).
-- Roda depois da 20261027192700, numa transacao que TERMINA EM RAISE (nada fica gravado). Contas, extratos, lancamentos e
-- saldos SINTETICOS no cliente NJ, em jan/2031 (mes sem dado real).
-- T1 extrato com dia de diferenca e que nao fecha, mas o SALDO fecha -> 'conciliado', motivos [], tudo em `avisos`.
-- T2 saldo diverge (com e sem extrato) -> 'nao_conciliado' so' com 'saldo_diverge'; 'sem_extrato' e' aviso.
-- T3 sem saldo final -> 'pendente' com 'saldo_nao_informado'.
-- T4 par: cada conta pelo SEU saldo proprio; par_status = o da mae; 'conferida_com' nos avisos; a interna CONTA no subtotal e no
--    total (interna divergente + mae conciliada = total nao conciliado; o inverso; as duas conciliadas).
-- T5 posicao: com saldo declarado antes do fim do mes o status julga a diferenca PROPRIA na data; aviso dos realizados depois.
-- T6 (decisao 2) diferenca = round(extrato, 2) - round(sistema, 2): valor de 3 casas nao fabrica 0,01.
-- T7 (decisao 3) primeiro mes: sem saldo final do mes anterior vale o saldo inicial INFORMADO na linha do mes; proprio = topo.
-- T8 agregados: `contas_com_aviso` {qtde, qtde_alem_sem_extrato, por_aviso}; status do ano = resumo (status, motivos e avisos).
-- T9 contrato: `avisos` e' a ULTIMA coluna; ACL, SECURITY DEFINER e plan_cache_mode das tres funcoes.
set local statement_timeout = '120s';
set local lock_timeout = '3s';

create function pg_temp.conta(p_nome text, p_tipo text, p_cons uuid default null) returns uuid language sql as $f$
  insert into financeiro_contas_bancarias (cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa, consolida_em_conta_id)
  values ('f2d67cd4-24d0-456f-a079-a3281dcce7fd', p_nome, p_nome, p_tipo, true, p_cons) returning id $f$;
create function pg_temp.ext(p_conta uuid, p_d date, p_v numeric) returns uuid language sql as $f$
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao, documento)
  values ('f2d67cd4-24d0-456f-a079-a3281dcce7fd', p_conta, p_d, p_v, case when p_v > 0 then 'credito' else 'debito' end,
          md5(random()::text), 'SINT', 'SINT-' || gen_random_uuid()) returning id $f$;
create function pg_temp.lan(p_banc uuid, p_dest uuid, p_tipo text, p_sinal text, p_v numeric, p_st text, p_dp date) returns uuid language sql as $f$
  insert into financeiro_lancamentos_v2 (cliente_id, conta_bancaria_id, conta_destino_id, tipo_operacao, sinal, valor, status_transacao,
                                         data_pagamento, data_competencia, data_vencimento, cenario, descricao,
                                         plano_conta_id, favorecido_id)
  values ('f2d67cd4-24d0-456f-a079-a3281dcce7fd', p_banc, p_dest, p_tipo, p_sinal, p_v, p_st, p_dp, coalesce(p_dp, date '2031-01-02'),
          coalesce(p_dp, date '2031-01-02'), 'realizado', 'SINT ss01a',
          -- CONC-SEM-CLASSIFICACAO-01: os sinteticos sao lancamentos CLASSIFICADOS e com fornecedor (este teste e' de saldo;
          -- sem plano ou sem fornecedor eles acenderiam os avisos 'sem_classificacao' / 'sem_fornecedor')
          (select p.id from financeiro_plano_contas p where p.ativo and p.cliente_id is null
              and p.tipo_operacao = case when p_tipo like '3-%' then '3-Transferências' else p_tipo end order by p.ordem_exibicao limit 1),
          (select f.id from financeiro_fornecedores f where f.cliente_id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd' order by f.created_at, f.id limit 1))
  returning id $f$;
create function pg_temp.vin(p_e uuid, p_l uuid, p_ap numeric) returns void language sql as $f$
  insert into conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado)
  values ('f2d67cd4-24d0-456f-a079-a3281dcce7fd', p_e, p_l, p_ap) $f$;
create function pg_temp.saldo(p_conta uuid, p_mes text, p_final numeric, p_data date default null) returns void language sql as $f$
  insert into financeiro_saldos_bancarios_v2 (cliente_id, conta_bancaria_id, ano_mes, saldo_final, saldo_data)
  values ('f2d67cd4-24d0-456f-a079-a3281dcce7fd', p_conta, p_mes, p_final, p_data) $f$;


do $t$
declare
  c_cli constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  a1 uuid; d1 uuid; d2 uuid; p1 uuid; m uuid; i uuid; n uuid; ni uuid; o uuid; oi uuid; q1 uuid; q2 uuid; qm uuid; qi uuid; r3 uuid; f1 uuid; f2 uuid;
  r record; t record; v_out text := ''; a text; b text; v_conf jsonb; e uuid;
begin
  perform set_config('app.conciliar_bloco', 'on', true);
  a1 := pg_temp.conta('SINT SS A1', 'cc'); d1 := pg_temp.conta('SINT SS D1', 'cc'); d2 := pg_temp.conta('SINT SS D2', 'cartao');
  p1 := pg_temp.conta('SINT SS P1', 'cc'); m := pg_temp.conta('SINT SS M', 'cc'); i := pg_temp.conta('SINT SS I', 'inv', m);
  n := pg_temp.conta('SINT SS N', 'cc'); ni := pg_temp.conta('SINT SS NI', 'inv', n);
  o := pg_temp.conta('SINT SS O', 'cc'); oi := pg_temp.conta('SINT SS OI', 'inv', o);
  q1 := pg_temp.conta('SINT SS Q1', 'cc'); q2 := pg_temp.conta('SINT SS Q2', 'cc');
  qm := pg_temp.conta('SINT SS QM', 'cc'); qi := pg_temp.conta('SINT SS QI', 'inv', qm);
  r3 := pg_temp.conta('SINT SS R3', 'cc'); f1 := pg_temp.conta('SINT SS F1', 'cc'); f2 := pg_temp.conta('SINT SS F2', 'cc');

  -- ── T1: o extrato reclama, o saldo fecha ──
  -- lancamento +80 em 05 sem extrato; extrato +80 em 06 sem lancamento; extrato +0,02 em 07 sem lancamento; informado = sistema
  perform pg_temp.lan(null, a1, '1-Entradas', '1', 80, 'realizado', '2031-01-05');
  perform pg_temp.ext(a1, '2031-01-06', 80); perform pg_temp.ext(a1, '2031-01-07', 0.02);
  perform pg_temp.saldo(a1, '2030-12', 100); perform pg_temp.saldo(a1, '2031-01', 180);
  select * into r from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[a1]) f where f.nivel = 'conta';
  if r.status <> 'conciliado' or r.motivos <> '[]'::jsonb or r.diferenca <> 0
     or r.avisos <> '[{"motivo": "dias_com_diferenca", "qtde": 3, "dias": ["2031-01-05", "2031-01-06", "2031-01-07"]},
                      {"motivo": "extrato_nao_fecha", "valor": -0.02},
                      {"motivo": "extratos_sem_par", "qtde": 2, "valor": 80.02},
                      {"motivo": "lancamentos_sem_par", "qtde": 1, "valor": 80.00}]'::jsonb then
    raise exception 'T1: % motivos % avisos %', r.status, r.motivos, r.avisos;
  end if;
  v_out := v_out || 'T1 ok (saldo fecha = conciliado; 3 dias, extrato nao fecha -0,02 e sem par so nos avisos); ';

  -- ── T2: o saldo diverge ──
  e := pg_temp.ext(d1, '2031-01-04', 50); perform pg_temp.vin(e, pg_temp.lan(null, d1, '1-Entradas', '1', 50, 'realizado', '2031-01-04'), 50);
  perform pg_temp.saldo(d1, '2030-12', 10); perform pg_temp.saldo(d1, '2031-01', 75);          -- sistema 60, informado 75
  perform pg_temp.saldo(d2, '2030-12', 10); perform pg_temp.saldo(d2, '2031-01', 4);           -- sem extrato, sem movimento: 10 x 4
  select string_agg(f.conta_nome || '=' || f.status || ' ' || f.motivos::text || ' ' || f.avisos::text, ' · ' order by f.conta_nome) into a
    from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[d1, d2]) f where f.nivel = 'conta';
  if a <> 'SINT SS D1=nao_conciliado [{"valor": 15.00, "motivo": "saldo_diverge"}] [{"valor": 15.00, "motivo": "extrato_nao_fecha"}]'
       || ' · SINT SS D2=nao_conciliado [{"valor": -6.00, "motivo": "saldo_diverge"}] [{"motivo": "sem_extrato"}]' then
    raise exception 'T2: %', a;
  end if;
  v_out := v_out || 'T2 ok (com extrato +15,00 e sem extrato -6,00: so saldo_diverge nos motivos); ';

  -- ── T3: pendente ──
  perform pg_temp.saldo(p1, '2030-12', 10);
  select f.status || ' ' || f.motivos::text || ' ' || f.avisos::text into a from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[p1]) f where f.nivel = 'conta';
  if a <> 'pendente [{"falta": "final", "motivo": "saldo_nao_informado"}] [{"motivo": "sem_extrato"}]' then raise exception 'T3: %', a; end if;
  v_out := v_out || 'T3 ok (sem saldo final = pendente, saldo_nao_informado); ';

  -- ── T4: o par ──
  -- mae fecha (1.000 - 200 = 800); a interna NAO fecha (500 + 200 = 700, informado 705)
  perform pg_temp.saldo(m, '2030-12', 1000); perform pg_temp.saldo(i, '2030-12', 500);
  perform pg_temp.lan(m, i, '3-Transferências', '-1', 200, 'realizado', '2031-01-10');
  perform pg_temp.saldo(m, '2031-01', 800); perform pg_temp.saldo(i, '2031-01', 705);
  v_conf := jsonb_build_array(jsonb_build_object('motivo', 'conferida_com', 'conta_id', m, 'conta_nome', 'SINT SS M'));
  for t in select * from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[m, i]) loop
    if t.conta_id = m and ((t.status, t.par_status) is distinct from ('conciliado', null::text) or t.motivos <> '[]'::jsonb
                           or (t.proprio->>'diferenca')::numeric <> 0 or t.diferenca <> 5) then
      raise exception 'T4 mae: % % dif propria % consolidada %', t.status, t.motivos, t.proprio->>'diferenca', t.diferenca;
    end if;
    if t.conta_id = i and ((t.status, t.par_status, t.par_conta_id) is distinct from ('nao_conciliado', 'conciliado', m)
                           or t.motivos <> '[{"motivo": "saldo_diverge", "valor": 5.00}]'::jsonb
                           or t.avisos is distinct from jsonb_build_array(jsonb_build_object('motivo', 'sem_extrato')) || v_conf) then
      raise exception 'T4 interna: % par % motivos % avisos %', t.status, t.par_status, t.motivos, t.avisos;
    end if;
    if t.nivel = 'tipo' and t.tipo_conta = 'inv' and (t.status <> 'nao_conciliado' or (t.motivos->0->'contas'->0->>'conta_id')::uuid <> i
         or t.motivos->0->'contas'->0->'avisos' is distinct from jsonb_build_array(jsonb_build_object('motivo', 'sem_extrato')) || v_conf) then
      raise exception 'T4 inv: % %', t.status, t.motivos;
    end if;
    if t.nivel = 'tipo' and t.tipo_conta = 'cc' and t.status <> 'conciliado' then raise exception 'T4 cc: %', t.status; end if;
    -- TODA conta entra uma vez com o SEU status, a interna inclusive: interna divergente + mae conciliada = total nao conciliado
    if t.nivel = 'total' and (t.status <> 'nao_conciliado' or (t.motivos->0->>'motivo', (t.motivos->0->>'qtde')::int) is distinct from ('contas_nao_conciliadas', 1)
                              or (t.motivos->0->'contas'->0->>'conta_id')::uuid <> i
                              -- as SOMAS nao mudam: 1.000 + 500 de inicial, 800 + 700 de sistema, 800 + 705 informado
                              or (t.saldo_inicial, t.saldo_sistema, t.saldo_extrato, t.diferenca) is distinct from (1500, 1500, 1505, 5)) then
      raise exception 'T4 total: % % · % % % %', t.status, t.motivos, t.saldo_inicial, t.saldo_sistema, t.saldo_extrato, t.diferenca;
    end if;
  end loop;
  -- o inverso: a mae diverge (1.000 - 200 = 800, informado 790), a interna fecha (700)
  perform pg_temp.saldo(n, '2030-12', 1000); perform pg_temp.saldo(ni, '2030-12', 500);
  perform pg_temp.lan(n, ni, '3-Transferências', '-1', 200, 'realizado', '2031-01-10');
  perform pg_temp.saldo(n, '2031-01', 790); perform pg_temp.saldo(ni, '2031-01', 700);
  select string_agg(format('%s%s=%s', f.nivel, coalesce(':' || f.tipo_conta, ''), f.status), ' ' order by f.nivel, f.tipo_conta, f.conta_nome) into a
    from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[n, ni]) f;
  if a <> 'conta:cc=nao_conciliado conta:inv=conciliado tipo:cc=nao_conciliado tipo:inv=conciliado total=nao_conciliado' then raise exception 'T4 inverso: %', a; end if;
  if (select (f.motivos->0->'contas'->0->>'conta_id')::uuid from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[n, ni]) f where f.nivel = 'total') <> n
     or (select f.par_status from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[n, ni]) f where f.conta_id = ni) <> 'nao_conciliado' then
    raise exception 'T4 inverso: a conta citada no total nao e a mae, ou par_status nao e o da mae';
  end if;
  -- as duas fecham (QM/QI de T5 ainda nao existem: par proprio)
  perform pg_temp.saldo(o, '2030-12', 1000); perform pg_temp.saldo(oi, '2030-12', 500);
  perform pg_temp.lan(o, oi, '3-Transferências', '-1', 200, 'realizado', '2031-01-10');
  perform pg_temp.saldo(o, '2031-01', 800); perform pg_temp.saldo(oi, '2031-01', 700);
  select string_agg(format('%s%s=%s %s', f.nivel, coalesce(':' || f.tipo_conta, ''), f.status, f.motivos), ' ' order by f.nivel, f.tipo_conta, f.conta_nome) into a
    from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[o, oi]) f;
  if a <> 'conta:cc=conciliado [] conta:inv=conciliado [] tipo:cc=conciliado [] tipo:inv=conciliado [] total=conciliado []' then raise exception 'T4 as duas: %', a; end if;
  v_out := v_out || 'T4 ok (interna divergente + mae conciliada: inv e TOTAL nao conciliados, citando a interna, somas iguais; mae divergente + interna conciliada: cc e total nao conciliados; as duas conciliadas: tudo conciliado); ';

  -- ── T5: a posicao ──
  -- Q1: informado 140 em 15/01; ate' 15/01 o sistema da' 140; em 20/01 entra +7 (mes: 147)
  perform pg_temp.lan(null, q1, '1-Entradas', '1', 40, 'realizado', '2031-01-10'); perform pg_temp.lan(null, q1, '1-Entradas', '1', 7, 'realizado', '2031-01-20');
  perform pg_temp.saldo(q1, '2030-12', 100); perform pg_temp.saldo(q1, '2031-01', 140, '2031-01-15');
  -- Q2: informado 150 em 15/01; ate' 15/01 o sistema da' 140
  perform pg_temp.lan(null, q2, '1-Entradas', '1', 40, 'realizado', '2031-01-10'); perform pg_temp.lan(null, q2, '1-Entradas', '1', 10, 'realizado', '2031-01-20');
  perform pg_temp.saldo(q2, '2030-12', 100); perform pg_temp.saldo(q2, '2031-01', 150, '2031-01-15');
  select string_agg(format('%s=%s %s %s dif %s na data %s', f.conta_nome, f.status, f.motivos, f.avisos, f.diferenca, f.posicao->>'diferenca_propria_na_data'), ' · ' order by f.conta_nome) into a
    from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[q1, q2]) f where f.nivel = 'conta';
  if a <> 'SINT SS Q1=conciliado [] [{"motivo": "sem_extrato"}, {"data": "2031-01-15", "qtde": 1, "valor": 7.00, "motivo": "realizados_apos_posicao"}] dif -7.00 na data 0.00'
       || ' · SINT SS Q2=nao_conciliado [{"valor": 10.00, "motivo": "saldo_diverge", "posicao": "2031-01-15"}] [{"motivo": "sem_extrato"}, {"data": "2031-01-15", "qtde": 1, "valor": 10.00, "motivo": "realizados_apos_posicao"}] dif 0.00 na data 10.00' then
    raise exception 'T5: %', a;
  end if;
  -- a mae com posicao: a diferenca PROPRIA na data (500 - 100 ate' 12/01 = 400 informado), a consolidada e' outra
  perform pg_temp.saldo(qm, '2030-12', 500); perform pg_temp.saldo(qi, '2030-12', 50);
  perform pg_temp.lan(qm, qi, '3-Transferências', '-1', 100, 'realizado', '2031-01-08');
  perform pg_temp.saldo(qm, '2031-01', 400, '2031-01-12'); perform pg_temp.saldo(qi, '2031-01', 150);
  select * into r from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[qm]) f where f.nivel = 'conta';
  if r.status <> 'conciliado' or (r.posicao->>'diferenca_propria_na_data')::numeric <> 0 or (r.posicao->>'saldo_sistema_proprio_na_data')::numeric <> 400 then
    raise exception 'T5 mae: % posicao %', r.status, r.posicao;
  end if;
  v_out := v_out || 'T5 ok (posicao fecha = conciliado com o mes em -7 e o aviso; posicao diverge = saldo_diverge com a data; mae pela propria na data); ';

  -- ── T6: tres casas ──
  perform pg_temp.lan(null, r3, '1-Entradas', '1', 0.125, 'realizado', '2031-01-09');
  perform pg_temp.saldo(r3, '2030-12', 0); perform pg_temp.saldo(r3, '2031-01', 0.13);
  select * into r from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[r3]) f where f.nivel = 'conta';
  if (r.saldo_sistema, r.saldo_extrato, r.diferenca, (r.proprio->>'diferenca')::numeric, r.status) is distinct from (0.13, 0.13, 0.00, 0.00, 'conciliado') then
    raise exception 'T6: sistema % extrato % dif % propria % status %', r.saldo_sistema, r.saldo_extrato, r.diferenca, r.proprio->>'diferenca', r.status;
  end if;
  v_out := v_out || 'T6 ok (0,125 lancado x 0,13 informado: os dois mostram 0,13 e a diferenca e 0,00); ';

  -- ── T7: o primeiro mes ──
  insert into financeiro_saldos_bancarios_v2 (cliente_id, conta_bancaria_id, ano_mes, saldo_inicial, saldo_final) values
    (c_cli, f1, '2031-01', 100, 130), (c_cli, f2, '2031-01', null, 30);
  perform pg_temp.lan(null, f1, '1-Entradas', '1', 30, 'realizado', '2031-01-09');
  for r in select * from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[f1, f2]) f where f.nivel = 'conta' loop
    if r.conta_id = f1 and ((r.saldo_inicial, r.saldo_inicial_origem, r.saldo_sistema, r.diferenca, r.status) is distinct from (100, 'informado', 130.00, 0.00, 'conciliado')
         or (r.proprio->>'saldo_inicial')::numeric <> r.saldo_inicial or (r.proprio->>'saldo_sistema')::numeric <> r.saldo_sistema
         or (r.proprio->>'diferenca')::numeric <> r.diferenca) then
      raise exception 'T7 F1: ini % (%) sis % dif % status % proprio %', r.saldo_inicial, r.saldo_inicial_origem, r.saldo_sistema, r.diferenca, r.status, r.proprio;
    end if;
    -- sem saldo do mes anterior E sem inicial informado: continua pendente, falta o inicial
    if r.conta_id = f2 and (r.status <> 'pendente' or r.motivos <> '[{"falta": "inicial", "motivo": "saldo_nao_informado"}]'::jsonb or r.saldo_inicial is not null) then
      raise exception 'T7 F2: % % %', r.status, r.motivos, r.saldo_inicial;
    end if;
  end loop;
  v_out := v_out || 'T7 ok (primeiro mes: inicial informado 100 -> 130 conciliado, proprio = topo; sem inicial nenhum = pendente); ';

  -- ── T8: agregados e o status do ano ──
  select * into t from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[a1, d1, d2, p1]) f where f.nivel = 'total';
  if t.status <> 'nao_conciliado' or (t.motivos->0->>'qtde')::int <> 2 or t.motivos->1 <> '{"motivo": "contas_pendentes", "qtde": 1}'::jsonb
     or t.avisos <> '[{"motivo": "contas_com_aviso", "qtde": 4, "qtde_alem_sem_extrato": 2,
                       "por_aviso": {"sem_extrato": 2, "dias_com_diferenca": 1, "extrato_nao_fecha": 2, "extratos_sem_par": 1, "lancamentos_sem_par": 1}}]'::jsonb then
    raise exception 'T8 total: % % %', t.status, t.motivos, t.avisos;
  end if;
  select string_agg(format('%s|%s|%s|%s|%s', s.ano_mes, s.conta_id, s.status, s.motivos, s.avisos), E'\n' order by s.ano_mes, s.nivel, s.conta_id), count(*)::text
    into a, b from fn_conciliacao_status_ano(c_cli, 2031) s where s.nivel = 'total';
  if b <> '12' or a is distinct from (
       select string_agg(format('%s|%s|%s|%s|%s', q.mes, y.conta_id, y.status, y.motivos, y.avisos), E'\n' order by q.mes)
         from (select to_char(make_date(2031, g, 1), 'YYYY-MM') mes from generate_series(1, 12) g) q, lateral fn_conciliacao_resumo_mes(c_cli, q.mes) y
        where y.nivel = 'total') then
    raise exception E'T8: status do ano <> resumo (%)\n%', b, a;
  end if;
  if (select count(*) from fn_conciliacao_status_ano(c_cli, 2031) s join lateral fn_conciliacao_resumo_mes(c_cli, s.ano_mes, array[s.conta_id]) y on y.nivel = 'conta'
       where s.nivel = 'conta' and s.ano_mes = '2031-01' and (s.status, s.motivos) is distinct from (y.status, y.motivos)) > 0
     or (select count(*) from fn_conciliacao_status_ano(c_cli, 2031) s where s.nivel = 'conta' and s.ano_mes = '2031-01') < 10 then
    raise exception 'T8: contas do status do ano <> resumo';
  end if;
  v_out := v_out || 'T8 ok (total: 2 nao conciliadas, 1 pendente, 4 contas com aviso / 2 alem de sem extrato; status do ano = 12 resumos com avisos); ';

  -- ── T9: contrato ──
  if (select p.proargnames[array_upper(p.proargnames, 1)] from pg_proc p where p.oid = 'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])'::regprocedure) <> 'avisos'
     or (select p.proargnames[array_upper(p.proargnames, 1)] from pg_proc p where p.oid = 'public.fn_conciliacao_status_ano(uuid, integer)'::regprocedure) <> 'avisos'
     or (select p.proargnames[array_upper(p.proargnames, 1)] from pg_proc p where p.oid = 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)'::regprocedure) <> 'avisos' then
    raise exception 'T9: avisos nao e a ultima coluna';
  end if;
  if has_function_privilege('authenticated', 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_conciliacao_status_ano(uuid, integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_conciliacao_status_ano(uuid, integer)', 'EXECUTE')
     or exists (select 1 from pg_proc p where p.proname in ('_fn_conciliacao_resumo', 'fn_conciliacao_resumo_mes', 'fn_conciliacao_status_ano')
                  and p.pronamespace = 'public'::regnamespace
                  and (not p.prosecdef or not ('plan_cache_mode=force_custom_plan' = any (p.proconfig)))) then
    raise exception 'T9: ACL / SECURITY DEFINER / plan_cache_mode';
  end if;
  v_out := v_out || 'T9 ok (avisos e a ultima coluna nas tres; ACL e config); ';

  raise exception 'OK %', v_out using errcode = 'P0001';
end $t$;
