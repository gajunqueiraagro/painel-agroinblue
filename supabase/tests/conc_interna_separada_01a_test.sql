-- PR-CONC-INTERNA-SEPARADA-01a — testes SINTETICOS, numa transacao que TERMINA EM RAISE (nada fica gravado).
-- Roda DEPOIS da migration 20261027192300 (ou colado logo depois dela, na mesma transacao):
--   `supabase db query --linked -f supabase/tests/conc_interna_separada_01a_test.sql`
--
-- Contas NOVAS no cliente do NJ, em jan/2031 (mes sem fechamento). Tres pares mae (cc) + interna (inv) e uma conta comum:
--   A  M + I  — o par NAO conciliado: a mae paga 30 a terceiro (com extrato), aplica 200 na interna, e a interna rende 7 de
--              terceiro (sem extrato: o informado nao fecha com o extrato da mae).
--   B  M2 + I2 — o par conciliado: a mae recebe 100 (com extrato) e aplica 40; posicao declarada em 20/01.
--   C  M3 + I3 — o par pendente: nada lancado, nada informado.
--   K  conta comum de investimento, parada (saldo 10 -> 10).
-- D1 `proprio` (10 campos): conta comum e interna = os campos de cima; mae = o inicial e o extrato DELA + o movimento dela com
--    as transferencias com a interna. O CONSOLIDADO da mae = Σ proprios (soma o movimento da interna com terceiros).
-- D2 interna: `par_conta_id`, `par_status` = status = o da mae, motivo 'conferida_com' (com a mae na chamada e sozinha); mae:
--    `internas`.
-- D3 subtotais: os SALDOS somam o `proprio` de cada conta no tipo dela; entradas/saidas seguem o consolidado; o subtotal do tipo
--    conta a interna com o status do par (tipo so' com a interna herda o veredito do par); o TOTAL conta o par UMA vez.
-- D4 status do ano: a interna aparece em todo mes em que a mae aparece, com o status do par; o total = o do resumo.
-- D5 `linhas_sistema` da mae: a linha 'transferencia_interna' e o `saldo_apos_proprio` fechando em `proprio.saldo_sistema`; o
--    `saldo_apos` consolidado nao a soma; `posicao.saldo_sistema_proprio_na_data`.
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
                                         data_pagamento, data_competencia, data_vencimento, cenario, descricao)
  values ('f2d67cd4-24d0-456f-a079-a3281dcce7fd', p_banc, p_dest, p_tipo, p_sinal, p_v, p_st, p_dp, coalesce(p_dp, date '2031-01-02'),
          coalesce(p_dp, date '2031-01-02'), 'realizado', 'SINT is01a') returning id $f$;
create function pg_temp.vin(p_e uuid, p_l uuid, p_ap numeric) returns void language sql as $f$
  insert into conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado)
  values ('f2d67cd4-24d0-456f-a079-a3281dcce7fd', p_e, p_l, p_ap) $f$;
create function pg_temp.saldo(p_conta uuid, p_mes text, p_final numeric, p_data date default null) returns void language sql as $f$
  insert into financeiro_saldos_bancarios_v2 (cliente_id, conta_bancaria_id, ano_mes, saldo_final, saldo_data)
  values ('f2d67cd4-24d0-456f-a079-a3281dcce7fd', p_conta, p_mes, p_final, p_data) $f$;

do $t$
declare
  c_cli constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  m uuid; i uuid; m2 uuid; i2 uuid; m3 uuid; i3 uuid; k uuid; t1 uuid;
  r record; ri record; t record; v_out text := ''; v_lin jsonb; a text; b text; v_conf jsonb; v_n int;
begin
  perform set_config('app.conciliar_bloco', 'on', true);
  m := pg_temp.conta('SINT IS M', 'cc');   i := pg_temp.conta('SINT IS I', 'inv', m);
  m2 := pg_temp.conta('SINT IS M2', 'cc'); i2 := pg_temp.conta('SINT IS I2', 'inv', m2);
  m3 := pg_temp.conta('SINT IS M3', 'cc'); i3 := pg_temp.conta('SINT IS I3', 'inv', m3);
  k := pg_temp.conta('SINT IS K', 'inv');

  -- par A
  perform pg_temp.saldo(m, '2030-12', 1000); perform pg_temp.saldo(i, '2030-12', 500);
  perform pg_temp.vin(pg_temp.ext(m, '2031-01-05', -30), pg_temp.lan(m, null, '2-Saídas', '-1', 30, 'realizado', '2031-01-05'), 30);
  t1 := pg_temp.lan(m, i, '3-Transferências', '-1', 200, 'realizado', '2031-01-10');
  perform pg_temp.lan(null, i, '1-Entradas', '1', 7, 'realizado', '2031-01-15');
  perform pg_temp.saldo(m, '2031-01', 770); perform pg_temp.saldo(i, '2031-01', 707);
  -- par B
  perform pg_temp.saldo(m2, '2030-12', 0); perform pg_temp.saldo(i2, '2030-12', 0);
  perform pg_temp.vin(pg_temp.ext(m2, '2031-01-04', 100), pg_temp.lan(null, m2, '1-Entradas', '1', 100, 'realizado', '2031-01-04'), 100);
  perform pg_temp.lan(m2, i2, '3-Transferências', '-1', 40, 'realizado', '2031-01-10');
  perform pg_temp.saldo(m2, '2031-01', 60, '2031-01-20'); perform pg_temp.saldo(i2, '2031-01', 40);
  -- conta comum
  perform pg_temp.saldo(k, '2030-12', 10); perform pg_temp.saldo(k, '2031-01', 10);

  -- ── D1: o saldo proprio ──
  select * into r from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[m]) f where f.nivel = 'conta';
  if (r.saldo_inicial, r.entradas, r.saidas, r.saldo_sistema, r.saldo_extrato, r.diferenca,
      r.entradas_terceiros, r.entradas_transferencias, r.saidas_terceiros, r.saidas_transferencias)
     is distinct from (1500, 7.00, -30.00, 1477.00, 1477, 0.00, 7.00, 0.00, -30.00, 0.00) then
    raise exception 'D1 mae consolidada: ini % ent % sai % sis % ext % dif % · % % % %', r.saldo_inicial, r.entradas, r.saidas, r.saldo_sistema,
      r.saldo_extrato, r.diferenca, r.entradas_terceiros, r.entradas_transferencias, r.saidas_terceiros, r.saidas_transferencias;
  end if;
  if r.proprio is distinct from jsonb_build_object(
       'saldo_inicial', 1000, 'entradas', 0, 'saidas', -230, 'saldo_sistema', 770, 'saldo_extrato', 770, 'diferenca', 0,
       'entradas_terceiros', 0, 'entradas_transferencias', 0, 'saidas_terceiros', -30, 'saidas_transferencias', -200) then
    raise exception 'D1 mae propria: %', r.proprio;
  end if;
  select * into ri from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[i]) f where f.nivel = 'conta';
  if ri.proprio is distinct from jsonb_build_object(
       'saldo_inicial', 500, 'entradas', 207, 'saidas', 0, 'saldo_sistema', 707, 'saldo_extrato', 707, 'diferenca', 0,
       'entradas_terceiros', 7, 'entradas_transferencias', 200, 'saidas_terceiros', 0, 'saidas_transferencias', 0)
     or ri.proprio is distinct from jsonb_build_object(
       'saldo_inicial', ri.saldo_inicial, 'entradas', ri.entradas, 'saidas', ri.saidas, 'saldo_sistema', ri.saldo_sistema,
       'saldo_extrato', ri.saldo_extrato, 'diferenca', ri.diferenca, 'entradas_terceiros', ri.entradas_terceiros,
       'entradas_transferencias', ri.entradas_transferencias, 'saidas_terceiros', ri.saidas_terceiros,
       'saidas_transferencias', ri.saidas_transferencias) then
    raise exception 'D1 interna: %', ri.proprio;
  end if;
  -- o consolidado do par = Σ proprios (o 7 da interna com terceiros esta' dentro)
  if r.saldo_sistema <> (r.proprio->>'saldo_sistema')::numeric + (ri.proprio->>'saldo_sistema')::numeric then
    raise exception 'D1: consolidado % <> soma dos proprios', r.saldo_sistema;
  end if;
  select * into t from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[k]) f where f.nivel = 'conta';
  if t.proprio is distinct from jsonb_build_object(
       'saldo_inicial', t.saldo_inicial, 'entradas', t.entradas, 'saidas', t.saidas, 'saldo_sistema', t.saldo_sistema,
       'saldo_extrato', t.saldo_extrato, 'diferenca', t.diferenca, 'entradas_terceiros', t.entradas_terceiros,
       'entradas_transferencias', t.entradas_transferencias, 'saidas_terceiros', t.saidas_terceiros,
       'saidas_transferencias', t.saidas_transferencias)
     or (t.proprio->>'saldo_sistema')::numeric <> 10 or t.par_conta_id is not null or t.par_status is not null or t.internas is not null then
    raise exception 'D1 conta comum: % par % internas %', t.proprio, t.par_conta_id, t.internas;
  end if;
  v_out := v_out || 'D1 ok (mae propria 1.000 - 30 - 200 = 770; interna 500 + 200 + 7 = 707; consolidado 1.477 = soma; comum = os campos de cima); ';

  -- ── D2: o par ──
  v_conf := jsonb_build_array(jsonb_build_object('motivo', 'conferida_com', 'conta_id', m, 'conta_nome', 'SINT IS M'));
  if r.status <> 'nao_conciliado' or r.par_conta_id is not null or r.par_status is not null
     or r.internas is distinct from jsonb_build_array(jsonb_build_object('conta_id', i, 'conta_nome', 'SINT IS I')) then
    raise exception 'D2 mae: status % par % internas %', r.status, r.par_conta_id, r.internas;
  end if;
  -- a interna SOZINHA na chamada (a mae nao esta' em p_conta_ids) ...
  if (ri.status, ri.par_status, ri.par_conta_id) is distinct from ('nao_conciliado', 'nao_conciliado', m) or ri.motivos is distinct from v_conf
     or ri.internas is not null then
    raise exception 'D2 interna sozinha: % % % %', ri.status, ri.par_status, ri.par_conta_id, ri.motivos;
  end if;
  -- ... e com a mae na chamada: o mesmo
  select * into t from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[m, i]) f where f.nivel = 'conta' and f.conta_id = i;
  if (t.status, t.par_status, t.par_conta_id) is distinct from ('nao_conciliado', 'nao_conciliado', m) or t.motivos is distinct from v_conf then
    raise exception 'D2 interna com a mae: % % % %', t.status, t.par_status, t.par_conta_id, t.motivos;
  end if;
  select string_agg(f.conta_nome || '=' || f.status || '/' || coalesce(f.par_status, '-'), ' ' order by f.conta_nome) into a
    from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[m2, i2, m3, i3]) f where f.nivel = 'conta';
  if a <> 'SINT IS I2=conciliado/conciliado SINT IS I3=pendente/pendente SINT IS M2=conciliado/- SINT IS M3=pendente/-' then
    raise exception 'D2 pares B e C: %', a;
  end if;
  v_out := v_out || 'D2 ok (interna = status do par, conferida_com, sozinha e com a mae; mae com internas; pares conciliado e pendente); ';

  -- ── D3: subtotais e total ──
  for t in select * from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[m, i, k]) f where f.nivel <> 'conta' loop
    if t.proprio is not null or t.par_conta_id is not null or t.par_status is not null or t.internas is not null then
      raise exception 'D3: campo novo em linha agregada %', t.conta_nome;
    end if;
    if t.nivel = 'tipo' and t.tipo_conta = 'cc' and (t.saldo_inicial, t.saldo_sistema, t.saldo_extrato, t.diferenca, t.entradas, t.saidas)
         is distinct from (1000, 770, 770, 0, 7.00, -30.00) then
      raise exception 'D3 cc: ini % sis % ext % dif % ent % sai %', t.saldo_inicial, t.saldo_sistema, t.saldo_extrato, t.diferenca, t.entradas, t.saidas;
    end if;
    if t.nivel = 'tipo' and t.tipo_conta = 'inv' and (t.saldo_inicial, t.saldo_sistema, t.saldo_extrato, t.diferenca, t.entradas, t.saidas)
         is distinct from (510, 717, 717, 0, 0, 0) then
      raise exception 'D3 inv: ini % sis % ext % dif % ent % sai %', t.saldo_inicial, t.saldo_sistema, t.saldo_extrato, t.diferenca, t.entradas, t.saidas;
    end if;
    -- o subtotal de Investimentos conta a interna com o status do par; a K (conciliada) nao o salva
    if t.nivel = 'tipo' and t.tipo_conta = 'inv' and (t.status <> 'nao_conciliado' or t.motivos is distinct from jsonb_build_array(
         jsonb_build_object('motivo', 'contas_nao_conciliadas', 'qtde', 1, 'contas', jsonb_build_array(jsonb_build_object(
           'conta_id', i, 'conta_nome', 'SINT IS I', 'status', 'nao_conciliado', 'motivos', v_conf))))) then
      raise exception 'D3 inv veredito: % %', t.status, t.motivos;
    end if;
    if t.nivel = 'total' and ((t.saldo_inicial, t.saldo_sistema, t.saldo_extrato, t.diferenca, t.entradas, t.saidas)
         is distinct from (1510, 1487, 1487, 0, 7.00, -30.00)
         -- o par vale UMA vez: so' a mae na lista
         or t.status <> 'nao_conciliado' or jsonb_array_length(t.motivos) <> 1 or (t.motivos->0->>'qtde')::int <> 1
         or jsonb_array_length(t.motivos->0->'contas') <> 1 or (t.motivos->0->'contas'->0->>'conta_id')::uuid <> m) then
      raise exception 'D3 total: ini % sis % ext % dif % ent % sai % · % %', t.saldo_inicial, t.saldo_sistema, t.saldo_extrato, t.diferenca,
        t.entradas, t.saidas, t.status, t.motivos;
    end if;
  end loop;
  -- o tipo cuja unica conta e' a interna herda o veredito do par: nao conciliado (A), conciliado (B) e pendente (C)
  select string_agg(f.nivel || coalesce(':' || f.tipo_conta, '') || '=' || f.status || ' ' || f.motivos::text, ' · ' order by f.nivel, f.tipo_conta) into a
    from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[m2, i2]) f where f.nivel <> 'conta';
  select string_agg(f.nivel || coalesce(':' || f.tipo_conta, '') || '=' || f.status || ' ' || f.motivos::text, ' · ' order by f.nivel, f.tipo_conta) into b
    from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[m3, i3]) f where f.nivel <> 'conta';
  if a <> 'tipo:cc=conciliado [] · tipo:inv=conciliado [] · total=conciliado []'
     or b <> 'tipo:cc=pendente [{"qtde": 1, "motivo": "contas_pendentes"}] · tipo:inv=pendente [{"qtde": 1, "motivo": "contas_pendentes"}] · total=pendente [{"qtde": 1, "motivo": "contas_pendentes"}]' then
    raise exception E'D3 tipo so com a interna:\n%\n%', a, b;
  end if;
  select f.status || ' ' || f.motivos::text into a from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[m, i]) f
   where f.nivel = 'tipo' and f.tipo_conta = 'inv';
  if a <> 'nao_conciliado ' || jsonb_build_array(jsonb_build_object('motivo', 'contas_nao_conciliadas', 'qtde', 1, 'contas',
            jsonb_build_array(jsonb_build_object('conta_id', i, 'conta_nome', 'SINT IS I', 'status', 'nao_conciliado', 'motivos', v_conf))))::text then
    raise exception 'D3 tipo so com a interna (A): %', a;
  end if;
  v_out := v_out || 'D3 ok (cc 770 · inv 717 · total 1.487; entradas/saidas consolidadas; inv conta a interna com o status do par; total conta o par uma vez; tipo so com a interna = o veredito do par nos 3 estados); ';

  -- ── D5: a lista do sistema da mae e a posicao ──
  v_lin := r.linhas_sistema;
  select string_agg(format('%s|%s|%s|%s|%s|%s|%s', l->>'data', l->>'tipo', l->>'valor', l->>'saldo_apos', l->>'saldo_apos_proprio',
                           l->>'status_exibicao', coalesce(l->>'transferencia', '-')), ' ' order by o) into a
    from jsonb_array_elements(v_lin) with ordinality x(l, o);
  if a <> '2031-01-05|vinculo|-30.00|1470.00|970.00|conciliado|- 2031-01-10|transferencia_interna|-200|1470.00|770.00|realizado|true' then
    raise exception 'D5 linhas: %', a;
  end if;
  if (select (l->>'lancamento_id')::uuid from jsonb_array_elements(v_lin) l where l->>'tipo' = 'transferencia_interna') <> t1
     or (v_lin->-1->>'saldo_apos_proprio')::numeric <> (r.proprio->>'saldo_sistema')::numeric
     -- o saldo_apos consolidado e' so' das linhas da mae: fecha em saldo_sistema MENOS o movimento da interna com terceiros (7)
     or r.saldo_sistema - (v_lin->-1->>'saldo_apos')::numeric <> 7
     or jsonb_array_length(r.dias) <> 1 or (r.dias->0->>'sistema')::numeric <> -30 then
    raise exception 'D5: ultima linha % proprio % dias %', v_lin->-1, r.proprio, r.dias;
  end if;
  if exists (select 1 from jsonb_array_elements(ri.linhas_sistema) l where l->>'tipo' = 'transferencia_interna')
     or (ri.linhas_sistema->-1->>'saldo_apos_proprio')::numeric <> 707 or (ri.linhas_sistema->-1->>'saldo_apos')::numeric <> 707 then
    raise exception 'D5 interna: %', ri.linhas_sistema;
  end if;
  select * into t from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[m2]) f where f.nivel = 'conta';
  if t.posicao is distinct from jsonb_build_object('data', '2031-01-20', 'saldo_sistema_na_data', 100.00, 'diferenca_na_data', 0.00,
                                                   'saldo_sistema_proprio_na_data', 60.00,
                                                   'realizados_apos', jsonb_build_object('qtde', 0, 'valor', 0)) then
    raise exception 'D5 posicao: %', t.posicao;
  end if;
  v_out := v_out || 'D5 ok (transferencia_interna -200 so no saldo_apos_proprio: 970 -> 770 = proprio; saldo_apos 1.470 = 1.477 - 7 da interna; posicao propria 60 x consolidada 100); ';

  -- ── D4: o status do ano ──
  perform pg_temp.lan(m, null, '2-Saídas', '-1', 5, 'realizado', '2031-03-03');
  select string_agg(format('%s|%s|%s|%s', s.ano_mes, s.conta_nome, s.status, s.motivos), E'\n' order by s.ano_mes, s.conta_nome), count(*)
    into a, v_n from fn_conciliacao_status_ano(c_cli, 2031) s where s.nivel = 'conta';
  select string_agg(format('%s|%s|%s|%s', q.mes, y.conta_nome, y.status, y.motivos), E'\n' order by q.mes, y.conta_nome) into b
    from (values ('2031-01', array[m, i, m2, i2]), ('2031-03', array[m, i])) q(mes, ids), lateral fn_conciliacao_resumo_mes(c_cli, q.mes, q.ids) y
   where y.nivel = 'conta';
  -- seis linhas: jan M, I, M2, I2 · mar M e a I (sem movimento proprio: aparece porque a mae aparece)
  if a is distinct from b or v_n <> 6 then raise exception E'D4: status do ano (% linhas)\n%\n<>\n%', v_n, a, b; end if;
  if (select s.status || ' ' || s.motivos::text from fn_conciliacao_status_ano(c_cli, 2031) s where s.ano_mes = '2031-03' and s.conta_id = i)
     is distinct from (select s.status from fn_conciliacao_status_ano(c_cli, 2031) s where s.ano_mes = '2031-03' and s.conta_id = m) || ' ' || v_conf::text then
    raise exception 'D4: interna em marco <> a mae';
  end if;
  select string_agg(format('%s|%s|%s', s.ano_mes, s.status, s.motivos), E'\n' order by s.ano_mes) into a
    from fn_conciliacao_status_ano(c_cli, 2031) s where s.nivel = 'total';
  select string_agg(format('%s|%s|%s', q.mes, y.status, y.motivos), E'\n' order by q.mes) into b
    from (select to_char(make_date(2031, g, 1), 'YYYY-MM') mes from generate_series(1, 12) g) q, lateral fn_conciliacao_resumo_mes(c_cli, q.mes) y
   where y.nivel = 'total';
  if a is distinct from b then raise exception E'D4: total do ano\n%\n<>\n%', a, b; end if;
  -- o par vale uma vez: num mes parado, as pendentes do total = as contas do universo SEM as internas
  if (select (x->>'qtde')::int from fn_conciliacao_status_ano(c_cli, 2031) s, jsonb_array_elements(s.motivos) x
       where s.nivel = 'total' and s.ano_mes = '2031-06' and x->>'motivo' = 'contas_pendentes')
     is distinct from (select count(*)::int from financeiro_contas_bancarias c where c.cliente_id = c_cli and c.ativa
                        and (c.mes_inicio is null or c.mes_inicio <= '2031-06') and c.consolida_em_conta_id is null) then
    raise exception 'D4: pendentes do total em junho';
  end if;
  v_out := v_out || format('D4 ok (%s linhas de conta = os resumos; a interna em marco pela mae; total do ano = 12 resumos; pendentes sem as internas); ', v_n);

  -- ── D6: assinatura, config e ACL ──
  if has_function_privilege('authenticated', 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_conciliacao_status_ano(uuid, integer)', 'EXECUTE')
     or exists (select 1 from pg_proc p where p.proname in ('_fn_conciliacao_resumo', '_fn_conciliacao_dias_conta', 'fn_conciliacao_resumo_mes',
                                                           'fn_conciliacao_status_ano') and p.pronamespace = 'public'::regnamespace
                   and not ('plan_cache_mode=force_custom_plan' = any (p.proconfig) and p.prosecdef)) then
    raise exception 'D6: ACL ou config inesperados';
  end if;
  v_out := v_out || 'D6 ok (helper com 7 argumentos, force_custom_plan, ACL); ';

  raise exception 'OK %', v_out using errcode = 'P0001';
end $t$;
