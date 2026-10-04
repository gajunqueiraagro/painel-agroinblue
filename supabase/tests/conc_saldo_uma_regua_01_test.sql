-- PR-CONC-SALDO-UMA-REGUA-01 — testes SINTETICOS, numa transacao que TERMINA EM RAISE (nada fica gravado).
-- Roda DEPOIS da migration 20261027191600 (ou colado logo depois dela, na mesma transacao):
--   `supabase db query --linked -f supabase/tests/conc_saldo_uma_regua_01_test.sql`
--
-- Contas NOVAS no cliente do NJ, em jan/2031 (mes sem fechamento), com o gatilho de promocao desligado (`app.conciliar_bloco`,
-- o mesmo que o motor do bloco usa) para o programado parcial ficar programado.
--
-- Conta A (com a interna B consolidada nela):
--   02 programado parcial 300, 200 aplicados ao extrato de 02 ............ entra pelo aplicado, NAO e' diferenca
--   03 extrato sem par +50 ................................................ dia com diferenca 'extrato_sem_par'
--   04 lancamento sem par +70 ............................................. 'lancamento_sem_par'
--   05 sobre-aplicacao: L2 (100) com 2 vinculos de 100; o gemeo L3 (100) sem par .. 'lancamento_sem_par' + 'sobre_aplicado'
--   07/08 sub-aplicado: L4 (50) com 30 aplicados no extrato de 08; resto 20 no dia 07 .. 'resto_sub_aplicado'
--   09 transferencia A -> B (a interna) sem extrato ....................... fora (nao e' diferenca); saldo CONSOLIDADO
--   10 L5 (60) pago em jan, vinculado a extrato de DEZ/2030 ............... 'lancamento_sem_par' (so' extratos do mes)
--   11 deposito liquido +983,70 = venda 1000 − Funrural 16,30 ............ sem diferenca; retido 16,30 (1); D3
-- Contas M1..M5: os motivos de D5. ⚠ (ii) e (iii) SOZINHOS NAO EXISTEM: com a = informado − inicial − Σ extrato (iii) e
--   b = Σ extrato − Σ sistema (a soma das diferencas dos dias), (ii) = a + b; (ii) so' com b ≠ 0 exige dia com diferenca, e
--   (iii) so' com a + b = 0 exige b ≠ 0. Os possiveis: (i) so' (timing), (ii)+(iii), (i)+(ii), (i)+(iii), os tres.
-- Conta S: mes sem extrato (o status de hoje, motivo 'sem_extrato'). E p_conta_ids NULL = todas as contas do cliente.
set local statement_timeout = '120s';
set local lock_timeout = '3s';

do $t$
declare
  c_cli constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); m1 uuid := gen_random_uuid(); m2 uuid := gen_random_uuid();
  m3 uuid := gen_random_uuid(); m4 uuid := gen_random_uuid(); m5 uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  r record; v_dias jsonb; v_out text := ''; v_n int; v_raw jsonb;
begin
  perform set_config('app.conciliar_bloco', 'on', true);
  insert into financeiro_contas_bancarias (id, cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa) values
    (a, c_cli, 'SINT A', 'SINT A', 'cc', true), (m1, c_cli, 'SINT M1', 'SINT M1', 'cc', true), (m2, c_cli, 'SINT M2', 'SINT M2', 'cc', true),
    (m3, c_cli, 'SINT M3', 'SINT M3', 'cc', true), (m4, c_cli, 'SINT M4', 'SINT M4', 'cc', true), (m5, c_cli, 'SINT M5', 'SINT M5', 'cc', true),
    (s, c_cli, 'SINT S', 'SINT S', 'cc', true);
  insert into financeiro_contas_bancarias (id, cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa, consolida_em_conta_id)
    values (b, c_cli, 'SINT B interna', 'SINT B interna', 'inv', true, a);

  -- ── conta A ──
  create temp table sx (k text primary key, id uuid) on commit drop;
  -- extratos (k, data, valor)
  insert into sx select k, gen_random_uuid() from unnest(array['E1','E2','E3','E4','E5','E6','E7','L1','L2','L3','L4','L5','P1','T1','V1','F1']) k;
  insert into extrato_bancario_v2 (id, cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao, documento)
  select (select id from sx where sx.k = e.k), c_cli, a, e.d, e.v, case when e.v > 0 then 'credito' else 'debito' end, md5(random()::text), 'SINT '||e.k, 'SINT-'||e.k
    from (values ('E1', date '2031-01-02', -200.00), ('E2', date '2031-01-03', 50.00), ('E3', date '2031-01-05', -100.00),
                 ('E4', date '2031-01-05', -100.00), ('E5', date '2031-01-08', -30.00), ('E6', date '2030-12-28', -60.00),
                 ('E7', date '2031-01-11', 983.70)) e(k, d, v);
  -- lancamentos (k, tipo, sinal, valor, status, data pagamento)
  insert into financeiro_lancamentos_v2 (id, cliente_id, conta_bancaria_id, conta_destino_id, tipo_operacao, sinal, valor, status_transacao,
                                         data_pagamento, data_competencia, data_vencimento, cenario, descricao)
  select (select id from sx where sx.k = l.k), c_cli,
         case when l.tp = '1-Entradas' then null else a end, case when l.tp = '1-Entradas' then a when l.tp = '3-Transferências' then b end,
         l.tp, l.sn, l.v, l.st, l.dp, coalesce(l.dp, date '2031-01-02'), coalesce(l.dp, date '2031-01-02'), 'realizado', 'SINT '||l.k
    from (values ('P1', '2-Saídas', '-1', 300.00, 'programado', null::date), ('L1', '1-Entradas', '1', 70.00, 'realizado', date '2031-01-04'),
                 ('L2', '2-Saídas', '-1', 100.00, 'realizado', date '2031-01-05'), ('L3', '2-Saídas', '-1', 100.00, 'realizado', date '2031-01-05'),
                 ('L4', '2-Saídas', '-1', 50.00, 'realizado', date '2031-01-07'), ('T1', '3-Transferências', '-1', 40.00, 'realizado', date '2031-01-09'),
                 ('L5', '2-Saídas', '-1', 60.00, 'realizado', date '2031-01-10'), ('V1', '1-Entradas', '1', 1000.00, 'realizado', date '2031-01-11'),
                 ('F1', '2-Saídas', '-1', 16.30, 'realizado', date '2031-01-11')) l(k, tp, sn, v, st, dp);
  insert into conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado)
  select c_cli, (select id from sx where sx.k = x.e), (select id from sx where sx.k = x.l), x.ap
    from (values ('E1','P1',200.00), ('E3','L2',100.00), ('E4','L2',100.00), ('E5','L4',30.00), ('E6','L5',60.00),
                 ('E7','V1',1000.00), ('E7','F1',16.30)) x(e, l, ap);
  if (select status_transacao from financeiro_lancamentos_v2 where id = (select id from sx where k = 'P1')) <> 'programado' then
    raise exception 'montagem: o programado parcial foi promovido';
  end if;
  -- saldos informados: A e B em dez/2030 e jan/2031 (B = 500 e 540: recebeu a transferencia de 40)
  -- Σ extrato de jan = -200 + 50 - 200 - 30 + 983,70 = 603,70 · A: 1.000 -> 1.603,70 - 40 (para B) = 1.563,70 · consolidado 2.103,70
  insert into financeiro_saldos_bancarios_v2 (cliente_id, conta_bancaria_id, ano_mes, saldo_final) values
    (c_cli, a, '2030-12', 1000), (c_cli, b, '2030-12', 500), (c_cli, a, '2031-01', 1563.70), (c_cli, b, '2031-01', 540);

  select * into r from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[a]);
  v_dias := r.dias_com_diferenca;
  -- dias com diferenca: 03 (+50 extrato sem par), 04 (−70), 05 (+100: o gemeo), 07 (+20 resto), 10 (+60)
  if (select string_agg((x->>'data') || ':' || (x->>'diferenca') || ':' || (x->'motivos')::text, ' ' order by x->>'data') from jsonb_array_elements(v_dias) x)
     <> '2031-01-03:50.00:["extrato_sem_par"] 2031-01-04:-70.00:["lancamento_sem_par"] 2031-01-05:100.00:["lancamento_sem_par", "sobre_aplicado"] 2031-01-07:20.00:["resto_sub_aplicado"] 2031-01-10:60.00:["lancamento_sem_par"]' then
    raise exception 'A: dias inesperados %', v_dias;
  end if;
  -- o dia 02 (parcial) e o 09 (interna) e o 11 (retencao) NAO estao entre os dias com diferenca
  if r.retido_em_depositos <> '{"qtde": 1, "valor": 16.30}'::jsonb then raise exception 'A: retido %', r.retido_em_depositos; end if;
  if r.saldo_inicial <> 1500 or r.saldo_extrato <> 2103.70 then raise exception 'A: saldos consolidados % / %', r.saldo_inicial, r.saldo_extrato; end if;
  -- sistema pelo caixa: -200 (parcial) -70... = Σ banco − Σ difs = 603,70 − (50 − 70 + 100 + 20 + 60) = 443,70 -> 1.943,70
  if r.saldo_sistema <> 1943.70 or r.diferenca <> 160.00 then raise exception 'A: saldo sistema % diferenca %', r.saldo_sistema, r.diferenca; end if;
  -- D3: a entrada do deposito e' o LIQUIDO (983,70, a venda menos a retencao) + o L1 sem par (70) = 1.053,70; o liquido nao muda
  if r.entradas <> 1053.70 or r.saidas <> -610.00 or round(r.entradas + r.saidas, 2) <> round(r.saldo_sistema - r.saldo_inicial, 2) then
    raise exception 'A: D3 entradas % saidas % (liquido %)', r.entradas, r.saidas, r.saldo_sistema - r.saldo_inicial;
  end if;
  -- PR-CONC-STATUS-SALDO-01a: o status e' o SALDO proprio (motivo so' 'saldo_diverge'); os dias com diferenca viram AVISO
  if r.status <> 'nao_conciliado' or (select string_agg(x->>'motivo', ',') from jsonb_array_elements(r.motivos) x) <> 'saldo_diverge'
     or not r.avisos @> '[{"motivo": "dias_com_diferenca", "qtde": 5}]'::jsonb then
    raise exception 'A: status % motivos % avisos %', r.status, r.motivos, r.avisos;
  end if;
  v_raw := public._fn_conciliacao_dias_conta(c_cli, a, '2031-01-01', '2031-01-31');
  if round((v_raw->>'entradas')::numeric + (v_raw->>'saidas')::numeric, 6) <> round((v_raw->>'sistema_total')::numeric, 6) then
    raise exception 'D3 (cru): entradas + saidas % <> sistema %', (v_raw->>'entradas')::numeric + (v_raw->>'saidas')::numeric, v_raw->>'sistema_total';
  end if;
  v_out := v_out || 'A ok (parcial, sem par x2, sobre, resto, interna, outro mes, retencao, consolidado, D3); ';

  -- ── os motivos de D5 ──
  -- M1 (i) so': timing — lancamento +80 em 05 sem extrato, extrato +80 em 06 sem lancamento; informado fecha
  insert into financeiro_lancamentos_v2 (cliente_id, conta_destino_id, tipo_operacao, sinal, valor, status_transacao, data_pagamento, data_competencia, cenario, descricao)
    values (c_cli, m1, '1-Entradas', '1', 80, 'realizado', '2031-01-05', '2031-01-05', 'realizado', 'SINT M1');
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento) values (c_cli, m1, '2031-01-06', 80, 'credito', md5(random()::text));
  -- M2 (ii)+(iii): dias perfeitos, informado errado em 10
  insert into financeiro_lancamentos_v2 (id, cliente_id, conta_destino_id, tipo_operacao, sinal, valor, status_transacao, data_pagamento, data_competencia, cenario, descricao)
    values ((select gen_random_uuid()), c_cli, m2, '1-Entradas', '1', 80, 'realizado', '2031-01-05', '2031-01-05', 'realizado', 'SINT M2');
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento) values (c_cli, m2, '2031-01-05', 80, 'credito', md5(random()::text));
  insert into conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado)
    select c_cli, e.id, l.id, 80 from extrato_bancario_v2 e, financeiro_lancamentos_v2 l where e.conta_bancaria_id = m2 and l.conta_destino_id = m2;
  -- M3 (i)+(ii): o extrato fecha com o informado; um lancamento sem par a mais no sistema
  insert into financeiro_lancamentos_v2 (cliente_id, conta_bancaria_id, tipo_operacao, sinal, valor, status_transacao, data_pagamento, data_competencia, cenario, descricao)
    values (c_cli, m3, '2-Saídas', '-1', 25, 'realizado', '2031-01-07', '2031-01-07', 'realizado', 'SINT M3');
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento) values (c_cli, m3, '2031-01-07', -10, 'debito', md5(random()::text));
  -- M4 (i)+(iii): o sistema fecha com o informado, mas falta o extrato (lancamento +45 sem par, informado o inclui)
  insert into financeiro_lancamentos_v2 (cliente_id, conta_destino_id, tipo_operacao, sinal, valor, status_transacao, data_pagamento, data_competencia, cenario, descricao)
    values (c_cli, m4, '1-Entradas', '1', 45, 'realizado', '2031-01-08', '2031-01-08', 'realizado', 'SINT M4');
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento) values (c_cli, m4, '2031-01-02', 0.01, 'credito', md5(random()::text));
  -- M5 os tres: lancamento sem par −30, extrato sem par +20, informado de outro valor
  insert into financeiro_lancamentos_v2 (cliente_id, conta_bancaria_id, tipo_operacao, sinal, valor, status_transacao, data_pagamento, data_competencia, cenario, descricao)
    values (c_cli, m5, '2-Saídas', '-1', 30, 'realizado', '2031-01-09', '2031-01-09', 'realizado', 'SINT M5');
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento) values (c_cli, m5, '2031-01-09', 20, 'credito', md5(random()::text));
  insert into financeiro_saldos_bancarios_v2 (cliente_id, conta_bancaria_id, ano_mes, saldo_final) values
    (c_cli, m1, '2030-12', 100), (c_cli, m1, '2031-01', 180),
    (c_cli, m2, '2030-12', 100), (c_cli, m2, '2031-01', 190),
    (c_cli, m3, '2030-12', 100), (c_cli, m3, '2031-01', 90),
    (c_cli, m4, '2030-12', 100), (c_cli, m4, '2031-01', 145),
    (c_cli, m5, '2030-12', 100), (c_cli, m5, '2031-01', 150),
    (c_cli, s, '2030-12', 100), (c_cli, s, '2031-01', 100);
  -- PR-CONC-STATUS-SALDO-01a: `m` = os MOTIVOS (o que decide: o saldo) e `a` = os AVISOS (a 2a prova, do extrato importado).
  -- M1 e M4 tem o saldo fechando: passam a 'conciliado', com os avisos; M2, M3 e M5 seguem 'nao_conciliado' so' por 'saldo_diverge'.
  for r in select f.conta_nome, f.status, coalesce((select string_agg(x->>'motivo', ',' order by x->>'motivo') from jsonb_array_elements(f.motivos) x), '') m,
                  coalesce((select string_agg(x->>'motivo', ',' order by x->>'motivo') from jsonb_array_elements(f.avisos) x), '') a, f.motivos, f.avisos
             from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[m1, m2, m3, m4, m5, s]) f loop
    if (r.conta_nome = 'SINT M1' and (r.status, r.m, r.a) is distinct from ('conciliado', '', 'dias_com_diferenca,extratos_sem_par,lancamentos_sem_par'))
       or (r.conta_nome = 'SINT M2' and (r.status, r.m, r.a) is distinct from ('nao_conciliado', 'saldo_diverge', 'extrato_nao_fecha'))
       or (r.conta_nome = 'SINT M3' and (r.status, r.m, r.a) is distinct from ('nao_conciliado', 'saldo_diverge', 'dias_com_diferenca,extratos_sem_par,lancamentos_sem_par'))
       or (r.conta_nome = 'SINT M4' and (r.status, r.m, r.a) is distinct from ('conciliado', '', 'dias_com_diferenca,extrato_nao_fecha,extratos_sem_par,lancamentos_sem_par'))
       or (r.conta_nome = 'SINT M5' and (r.status, r.m, r.a) is distinct from ('nao_conciliado', 'saldo_diverge', 'dias_com_diferenca,extrato_nao_fecha,extratos_sem_par,lancamentos_sem_par'))
       or (r.conta_nome = 'SINT S' and (r.status, r.m, r.a) is distinct from ('conciliado', '', 'sem_extrato')) then
      raise exception 'D5: % -> % motivos % avisos %', r.conta_nome, r.status, r.motivos, r.avisos;
    end if;
    v_out := v_out || format('%s %s [%s] avisos [%s]; ', r.conta_nome, r.status, r.m, r.a);
  end loop;
  -- o programado parcial sozinho: conta A sem o resto dos casos ja' foi; aqui a prova direta de que ele NAO e' diferenca
  if exists (select 1 from jsonb_array_elements(v_dias) x where x->>'data' = '2031-01-02') then raise exception 'parcial virou diferenca'; end if;

  -- ── p_conta_ids NULL = todas as contas do cliente ──
  -- PR-CONC-SALDO-UMA-REGUA-01b: o resumo passou a trazer os subtotais e o total depois das contas — contam-se as de nivel 'conta'
  select count(*) into v_n from fn_conciliacao_resumo_mes(c_cli, '2031-01', null) f where f.nivel = 'conta';
  if v_n <> (select count(*) from financeiro_contas_bancarias where cliente_id = c_cli) then raise exception 'todas: % linhas', v_n; end if;
  v_out := v_out || format('todas = %s contas; ', v_n);

  raise exception 'OK %', v_out using errcode = 'P0001';
end $t$;
