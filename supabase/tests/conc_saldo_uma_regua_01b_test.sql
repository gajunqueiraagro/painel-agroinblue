-- PR-CONC-SALDO-UMA-REGUA-01b — testes SINTETICOS, numa transacao que TERMINA EM RAISE (nada fica gravado).
-- Roda DEPOIS da migration 20261027191700 (ou colado logo depois dela, na mesma transacao):
--   `supabase db query --linked -f supabase/tests/conc_saldo_uma_regua_01b_test.sql`
--
-- Contas NOVAS no cliente do NJ, em jan/2031 (mes sem fechamento), com o gatilho de promocao desligado (`app.conciliar_bloco`)
-- para o programado parcial ficar programado.
--   AB  abertura (D2): transferencia recebida com extrato 500, entrada de terceiro sem par 200, saida de terceiro com extrato
--       50, transferencia enviada sem par 120, transferencia enviada na grafia singular '3-Transferência' 15.
--   C1 (cc, com a interna IC inv) conciliada · C2 (cc) so' timing (dias com diferenca, saldo fecha) — o TOTAL tem diferenca 0
--       e e' 'nao_conciliado' por causa da C2 (D3); a soma do total ignora a interna. Ajuste do D3 (20261027191800): a SX,
--       SEM extrato e divergente pela regua de hoje (saldo 10 -> 15 sem movimento), tambem derruba o total; a O3 'pendente'
--       nao derruba, e o total diz quantas pendentes ha'.
--   O2 herdado · O3 ausente (D4; C1 e' 'informado').
--   PP  posicao em 15/01 (D5): o mes diverge (−7, um realizado no dia 20), a posicao fecha.
--   LL (com a interna LI) a lista do sistema (D6): parcial, sobre-aplicado, gemeo sem par, sub-aplicado com o resto, interna fora.
--   + lancamentos sem conta (D3) e o status do ano = o resumo mes a mes (D7).
-- ATUALIZADO NO PR-CONC-INTERNA-SEPARADA-01a (migration 20261027192300) ao contrato novo, sem afrouxar: a posicao ganha
--   `saldo_sistema_proprio_na_data`; a transferencia com a interna ENTRA na lista como 'transferencia_interna' (so' no saldo
--   proprio); e no status do ano a interna aparece em todo mes em que a mae aparece. Roda depois da 20261027192300.
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
          coalesce(p_dp, date '2031-01-02'), 'realizado', 'SINT 01b') returning id $f$;
create function pg_temp.vin(p_e uuid, p_l uuid, p_ap numeric) returns void language sql as $f$
  insert into conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado)
  values ('f2d67cd4-24d0-456f-a079-a3281dcce7fd', p_e, p_l, p_ap) $f$;
create function pg_temp.saldo(p_conta uuid, p_mes text, p_final numeric, p_data date default null) returns void language sql as $f$
  insert into financeiro_saldos_bancarios_v2 (cliente_id, conta_bancaria_id, ano_mes, saldo_final, saldo_data)
  values ('f2d67cd4-24d0-456f-a079-a3281dcce7fd', p_conta, p_mes, p_final, p_data) $f$;

do $t$
declare
  c_cli constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  ab uuid; x uuid; c1 uuid; c2 uuid; ic uuid; o2 uuid; o3 uuid; pp uuid; ll uuid; li uuid; sx uuid;
  p1 uuid; l2 uuid; l3 uuid; l4 uuid; t1 uuid; e uuid;
  r record; t record; v_out text := ''; v_n int; v_raw jsonb; v_sem0 jsonb; v_lin jsonb; a text; b text;
begin
  perform set_config('app.conciliar_bloco', 'on', true);
  ab := pg_temp.conta('SINT AB', 'cc'); x := pg_temp.conta('SINT X', 'cc');
  c1 := pg_temp.conta('SINT C1', 'cc'); c2 := pg_temp.conta('SINT C2', 'cc'); ic := pg_temp.conta('SINT IC', 'inv', c1);
  o2 := pg_temp.conta('SINT O2', 'cc'); o3 := pg_temp.conta('SINT O3', 'cc'); pp := pg_temp.conta('SINT PP', 'cc');
  sx := pg_temp.conta('SINT SX', 'cc');
  ll := pg_temp.conta('SINT LL', 'cc'); li := pg_temp.conta('SINT LI', 'inv', ll);

  -- ── D2: abertura terceiros x transferencias ──
  e := pg_temp.ext(ab, '2031-01-03', 500); perform pg_temp.vin(e, pg_temp.lan(x, ab, '3-Transferências', '-1', 500, 'realizado', '2031-01-03'), 500);
  perform pg_temp.lan(null, ab, '1-Entradas', '1', 200, 'realizado', '2031-01-05');
  e := pg_temp.ext(ab, '2031-01-06', -50); perform pg_temp.vin(e, pg_temp.lan(ab, null, '2-Saídas', '-1', 50, 'realizado', '2031-01-06'), 50);
  perform pg_temp.lan(ab, x, '3-Transferências', '-1', 120, 'realizado', '2031-01-07');
  perform pg_temp.lan(ab, x, '3-Transferência', '-1', 15, 'realizado', '2031-01-08');
  perform pg_temp.saldo(ab, '2030-12', 1000); perform pg_temp.saldo(ab, '2031-01', 1515);
  select * into r from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[ab]) f where f.nivel = 'conta';
  if (r.entradas, r.entradas_terceiros, r.entradas_transferencias, r.saidas, r.saidas_terceiros, r.saidas_transferencias)
     is distinct from (700.00, 200.00, 500.00, -185.00, -50.00, -135.00) then
    raise exception 'D2: entradas % = % + % · saidas % = % + %', r.entradas, r.entradas_terceiros, r.entradas_transferencias,
      r.saidas, r.saidas_terceiros, r.saidas_transferencias;
  end if;
  v_raw := public._fn_conciliacao_dias_conta(c_cli, ab, '2031-01-01', '2031-01-31');
  if (v_raw->>'entradas')::numeric <> (v_raw->>'entradas_terceiros')::numeric + (v_raw->>'entradas_transferencias')::numeric
     or (v_raw->>'saidas')::numeric <> (v_raw->>'saidas_terceiros')::numeric + (v_raw->>'saidas_transferencias')::numeric then
    raise exception 'D2 (cru): as partes nao somam o total %', v_raw;
  end if;
  v_out := v_out || 'D2 ok (700 = 200 + 500 · -185 = -50 + -135, a grafia singular conta como transferencia); ';

  -- ── D3: subtotais e total ──
  e := pg_temp.ext(c1, '2031-01-04', 100); perform pg_temp.vin(e, pg_temp.lan(null, c1, '1-Entradas', '1', 100, 'realizado', '2031-01-04'), 100);
  perform pg_temp.saldo(c1, '2030-12', 0); perform pg_temp.saldo(c1, '2031-01', 100);
  perform pg_temp.saldo(ic, '2030-12', 1000); perform pg_temp.saldo(ic, '2031-01', 1000);
  perform pg_temp.lan(null, c2, '1-Entradas', '1', 80, 'realizado', '2031-01-05'); perform pg_temp.ext(c2, '2031-01-06', 80);
  perform pg_temp.saldo(c2, '2030-12', 0); perform pg_temp.saldo(c2, '2031-01', 80);
  for r in select * from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[c1, c2, ic]) loop
    if r.status = 'parcial' then raise exception 'D3: status parcial voltou'; end if;
    if r.nivel = 'conta' and r.dias is not null then raise exception 'D5: dias com mais de uma conta'; end if;
    if r.nivel = 'conta' and r.conta_id = c1 and (r.status, r.diferenca, r.saldo_inicial) is distinct from ('conciliado', 0.00, 1000) then
      raise exception 'D3 montagem C1: % % %', r.status, r.diferenca, r.saldo_inicial;
    end if;
    if r.nivel = 'conta' and r.conta_id = c2 and (r.status, r.diferenca) is distinct from ('nao_conciliado', 0.00) then
      raise exception 'D3 montagem C2: % %', r.status, r.diferenca;
    end if;
    if r.nivel = 'tipo' and r.tipo_conta = 'cc' and r.status <> 'nao_conciliado' then raise exception 'D3 tipo cc: %', r.status; end if;
    -- a interna IC (sem extrato, saldo 1.000 -> 1.000) concilia pela regua de hoje: o subtotal 'inv' e' 'conciliado'
    if r.nivel = 'tipo' and r.tipo_conta = 'inv' and (r.status, r.motivos) is distinct from ('conciliado', '[]'::jsonb) then
      raise exception 'D3 tipo inv: % %', r.status, r.motivos;
    end if;
    if r.nivel = 'total' then
      -- a diferenca do total e' ZERO e mesmo assim nao concilia: a C2 tem dias com diferenca
      if r.diferenca <> 0 or r.status <> 'nao_conciliado' or jsonb_array_length(r.motivos) <> 1
         or r.motivos->0->>'motivo' <> 'contas_nao_conciliadas'
         or (r.motivos->0->>'qtde')::int <> 1 or (r.motivos->0->'contas'->0->>'conta_id')::uuid <> c2
         or r.motivos->0->'contas'->0->'motivos'->0->>'motivo' <> 'dias_com_diferenca' then
        raise exception 'D3 total: dif % status % motivos %', r.diferenca, r.status, r.motivos;
      end if;
      -- a soma ignora a interna (o saldo dela ja' esta' na C1): 1.000, nao 2.000
      if r.saldo_inicial <> 1000 or r.saldo_sistema <> 1180 or r.saldo_extrato <> 1180 or r.sem_conta is not null then
        raise exception 'D3 total: soma com a interna? ini % sis % ext % sem_conta %', r.saldo_inicial, r.saldo_sistema, r.saldo_extrato, r.sem_conta;
      end if;
    end if;
  end loop;
  select f.status into a from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[c1]) f where f.nivel = 'total';
  if a <> 'conciliado' then raise exception 'D3: so C1 %', a; end if;
  -- ajuste do D3: conta SEM extrato que diverge pela regua de hoje derruba o total, listada com o motivo
  perform pg_temp.saldo(sx, '2030-12', 10); perform pg_temp.saldo(sx, '2031-01', 15);
  select * into t from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[c1, sx]) f where f.nivel = 'total';
  if t.status <> 'nao_conciliado' or t.motivos->0->>'motivo' <> 'contas_nao_conciliadas' or (t.motivos->0->>'qtde')::int <> 1
     or (t.motivos->0->'contas'->0->>'conta_id')::uuid <> sx or t.motivos->0->'contas'->0->>'status' <> 'nao_conciliado'
     or t.motivos->0->'contas'->0->'motivos' <> '[{"motivo": "sem_extrato"}]'::jsonb then
    raise exception 'D3 conta sem extrato divergente: % %', t.status, t.motivos;
  end if;
  -- 'pendente' nao derruba: o total concilia e diz quantas pendentes; so' pendentes = 'pendente'
  select f.status || ' ' || f.motivos::text into a from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[c1, o3]) f where f.nivel = 'total';
  select f.status || ' ' || f.motivos::text into b from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[o3]) f where f.nivel = 'total';
  if a <> 'conciliado [{"qtde": 1, "motivo": "contas_pendentes"}]' or b <> 'pendente [{"qtde": 1, "motivo": "contas_pendentes"}]' then
    raise exception 'D3 pendente: C1+O3 % · so O3 %', a, b;
  end if;
  v_out := v_out || 'D3 ok (total dif 0 + uma conta divergente = nao_conciliado com a conta e o motivo; conta SEM extrato divergente tambem derruba; pendente nao derruba e e contada; interna fora da soma; so C1 = conciliado); ';

  -- ── D3: lancamentos sem conta, na linha do total (so' com todas as contas) ──
  select f.sem_conta into v_sem0 from fn_conciliacao_resumo_mes(c_cli, '2031-01') f where f.nivel = 'total';
  perform pg_temp.lan(null, null, '1-Entradas', '1', 33, 'realizado', '2031-01-12');
  perform pg_temp.lan(null, null, '2-Saídas', '-1', 11, 'realizado', '2031-01-13');
  select * into r from fn_conciliacao_resumo_mes(c_cli, '2031-01') f where f.nivel = 'total';
  if (r.sem_conta->>'qtde')::int <> (v_sem0->>'qtde')::int + 2 or (r.sem_conta->>'entradas')::numeric <> (v_sem0->>'entradas')::numeric + 33
     or (r.sem_conta->>'saidas')::numeric <> (v_sem0->>'saidas')::numeric + 11
     or not exists (select 1 from jsonb_array_elements(r.motivos) m where m->>'motivo' = 'lancamentos_sem_conta' and (m->>'qtde')::int = (r.sem_conta->>'qtde')::int) then
    raise exception 'D3 sem conta: antes % depois % motivos %', v_sem0, r.sem_conta, r.motivos;
  end if;
  -- o status do total e' das contas: sem conta nao o muda
  if r.status <> (select case when count(*) filter (where f.tem_extrato) = 0 then 'pendente'
                              when count(*) filter (where f.tem_extrato and f.status <> 'conciliado') = 0 then 'conciliado' else 'nao_conciliado' end
                    from fn_conciliacao_resumo_mes(c_cli, '2031-01') f where f.nivel = 'conta') then
    raise exception 'D3 sem conta mudou o status do total: %', r.status;
  end if;
  v_out := v_out || format('sem conta ok (%s); ', r.sem_conta);

  -- ── D4: origem do saldo inicial ──
  perform pg_temp.saldo(o2, '2030-12', 10);
  select string_agg(f.conta_nome || '=' || f.saldo_inicial_origem, ',' order by f.conta_nome) into a
    from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[c1, o2, o3]) f where f.nivel = 'conta';
  if a <> 'SINT C1=informado,SINT O2=herdado,SINT O3=ausente' then raise exception 'D4: %', a; end if;
  if exists (select 1 from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[c1, o2]) f where f.nivel <> 'conta' and f.saldo_inicial_origem is not null) then
    raise exception 'D4: origem em linha agregada';
  end if;
  v_out := v_out || 'D4 ok; ';

  -- ── D5: posicao no meio do mes ──
  e := pg_temp.ext(pp, '2031-01-10', 40); perform pg_temp.vin(e, pg_temp.lan(null, pp, '1-Entradas', '1', 40, 'realizado', '2031-01-10'), 40);
  perform pg_temp.lan(null, pp, '1-Entradas', '1', 7, 'realizado', '2031-01-20');
  perform pg_temp.saldo(pp, '2030-12', 100); perform pg_temp.saldo(pp, '2031-01', 140, '2031-01-15');
  select * into r from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[pp]) f where f.nivel = 'conta';
  if r.saldo_sistema <> 147 or r.diferenca <> -7 or r.status <> 'nao_conciliado'
     or r.posicao <> jsonb_build_object('data', '2031-01-15', 'saldo_sistema_na_data', 140.00, 'diferenca_na_data', 0.00,
                                        'saldo_sistema_proprio_na_data', 140.00,
                                        'realizados_apos', jsonb_build_object('qtde', 1, 'valor', 7.00)) then
    raise exception 'D5: sistema % dif % status % posicao %', r.saldo_sistema, r.diferenca, r.status, r.posicao;
  end if;
  if (select f.posicao from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[c1]) f where f.nivel = 'conta') is not null then
    raise exception 'D5: posicao sem data declarada';
  end if;
  v_out := v_out || 'D5 posicao ok (mes -7 nao_conciliado; em 15/01 fecha, 1 realizado depois, 7,00); ';

  -- ── D6: a lista do sistema ──
  p1 := pg_temp.lan(ll, null, '2-Saídas', '-1', 300, 'programado', null);
  perform pg_temp.vin(pg_temp.ext(ll, '2031-01-02', -200), p1, 200);
  l2 := pg_temp.lan(ll, null, '2-Saídas', '-1', 100, 'realizado', '2031-01-05');
  perform pg_temp.vin(pg_temp.ext(ll, '2031-01-05', -100), l2, 100); perform pg_temp.vin(pg_temp.ext(ll, '2031-01-05', -100), l2, 100);
  l3 := pg_temp.lan(ll, null, '2-Saídas', '-1', 100, 'realizado', '2031-01-05');
  l4 := pg_temp.lan(ll, null, '2-Saídas', '-1', 50, 'realizado', '2031-01-07');
  perform pg_temp.vin(pg_temp.ext(ll, '2031-01-08', -30), l4, 30);
  t1 := pg_temp.lan(ll, li, '3-Transferências', '-1', 40, 'realizado', '2031-01-09');
  if (select status_transacao from financeiro_lancamentos_v2 where id = p1) <> 'programado' then raise exception 'montagem: parcial promovido'; end if;
  perform pg_temp.saldo(ll, '2030-12', 1000); perform pg_temp.saldo(li, '2030-12', 500);
  perform pg_temp.saldo(ll, '2031-01', 630); perform pg_temp.saldo(li, '2031-01', 540);
  select * into r from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[ll]) f where f.nivel = 'conta';
  v_lin := r.linhas_sistema;
  select string_agg(format('%s|%s|%s|%s|%s|%s', l->>'data', l->>'tipo', l->>'valor', coalesce(l->>'parcial', '-'), coalesce(l->>'falta', '-'),
                           coalesce(l->>'sobre_aplicado', '-')), ' ' order by l->>'data', l->>'tipo' desc, l->>'valor')
    into a from jsonb_array_elements(v_lin) l;
  if a <> '2031-01-02|vinculo|-200.00|true|100.00|- 2031-01-05|vinculo|-100.00|-|-|true 2031-01-05|vinculo|-100.00|-|-|true 2031-01-05|sem_par|-100|-|-|- 2031-01-07|resto_sub_aplicado|-20.00|-|-|- 2031-01-08|vinculo|-30.00|-|-|- 2031-01-09|transferencia_interna|-40|-|-|-' then
    raise exception 'D6: linhas %', a;
  end if;
  -- PR-CONC-INTERNA-SEPARADA-01a: a transferencia com a interna ENTRA na lista, uma vez, como 'transferencia_interna' — e so' no
  -- saldo PROPRIO: o consolidado (inicial + as demais linhas) continua sem ela.
  if (select string_agg(format('%s|%s|%s|%s', l->>'tipo', l->>'valor', l->>'transferencia', l->>'status_exibicao'), ' ')
        from jsonb_array_elements(v_lin) l where (l->>'lancamento_id')::uuid = t1) is distinct from 'transferencia_interna|-40|true|realizado' then
    raise exception 'D6: a transferencia com a interna %', (select jsonb_agg(l) from jsonb_array_elements(v_lin) l where (l->>'lancamento_id')::uuid = t1);
  end if;
  if r.saldo_inicial <> 1500 or r.saldo_sistema <> 950
     or round(r.saldo_inicial + (select sum((l->>'valor')::numeric) from jsonb_array_elements(v_lin) l
                                  where l->>'tipo' <> 'transferencia_interna'), 2) <> r.saldo_sistema then
    raise exception 'D6: inicial % + linhas <> sistema %', r.saldo_inicial, r.saldo_sistema;
  end if;
  if (r.proprio->>'saldo_inicial')::numeric <> 1000 or (r.proprio->>'saldo_sistema')::numeric <> 410
     or round((r.proprio->>'saldo_inicial')::numeric + (select sum((l->>'valor')::numeric) from jsonb_array_elements(v_lin) l), 2)
        <> (r.proprio->>'saldo_sistema')::numeric
     or (v_lin->-1->>'saldo_apos_proprio')::numeric <> 410 or (v_lin->-1->>'saldo_apos')::numeric <> 950 then
    raise exception 'D6 proprio: % · ultima linha %', r.proprio, v_lin->-1;
  end if;
  if jsonb_array_length(r.dias) <> 4 or (r.dias->-1->>'saldo_sistema')::numeric <> r.saldo_sistema
     or (r.dias->-1->>'sistema_acum')::numeric <> -550 or (r.dias->0->>'saldo_banco')::numeric <> 1300 then
    raise exception 'D5 dias: %', r.dias;
  end if;
  v_out := v_out || 'D6 ok (parcial falta 100, sobre x2, gemeo, resto 20, interna fora; 1.500 - 550 = 950; dias 4); ';

  -- ── D7: o status do ano = o resumo mes a mes ──
  select string_agg(format('%s|%s|%s|%s|%s', s.ano_mes, s.nivel, s.conta_id, s.status, s.motivos), E'\n' order by s.ano_mes, s.nivel, s.conta_id), count(*)
    into a, v_n from fn_conciliacao_status_ano(c_cli, 2031) s;
  select string_agg(format('%s|%s|%s|%s|%s', m.mes, y.nivel, y.conta_id, y.status, y.motivos), E'\n' order by m.mes, y.nivel, y.conta_id)
    into b
    from (select to_char(make_date(2031, g, 1), 'YYYY-MM') mes from generate_series(1, 12) g) m, lateral fn_conciliacao_resumo_mes(c_cli, m.mes) y
   where y.nivel = 'total' or (y.nivel = 'conta' and (y.tem_extrato or exists (
          select 1 from financeiro_lancamentos_v2 l where l.cliente_id = c_cli and l.cancelado = false
             and to_char(l.data_pagamento, 'YYYY-MM') = m.mes and (l.conta_bancaria_id = y.conta_id or l.conta_destino_id = y.conta_id))
          -- PR-CONC-INTERNA-SEPARADA-01a (D4): a interna aparece em todo mes em que a MAE aparece (extrato ou lancamento da mae)
          or (y.par_conta_id is not null and (
                exists (select 1 from extrato_bancario_v2 x where x.conta_bancaria_id = y.par_conta_id and x.cancelado_em is null
                           and x.ignorado_em is null and to_char(x.data_movimento, 'YYYY-MM') = m.mes)
                or exists (select 1 from financeiro_lancamentos_v2 l where l.cliente_id = c_cli and l.cancelado = false
                              and to_char(l.data_pagamento, 'YYYY-MM') = m.mes
                              and (l.conta_bancaria_id = y.par_conta_id or l.conta_destino_id = y.par_conta_id))))));
  if a is distinct from b or v_n < 12 + 8 then raise exception E'D7: status_ano (% linhas)\n%\n<>\n%', v_n, a, b; end if;
  v_out := v_out || format('D7 ok (%s linhas = 12 resumos); ', v_n);

  -- ── ACL ──
  if has_function_privilege('authenticated', 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_conciliacao_status_ano(uuid, integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_conciliacao_status_ano(uuid, integer)', 'EXECUTE') then
    raise exception 'ACL inesperada';
  end if;

  raise exception 'OK %', v_out using errcode = 'P0001';
end $t$;
