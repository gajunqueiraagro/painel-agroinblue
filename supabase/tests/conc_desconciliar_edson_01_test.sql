-- CONC-DESCONCILIAR-EDSON-01 — o casar pelas REGRAS R1–R3. Sintético no cliente Teste, admin simulado; `set constraints all immediate`
-- dispara a baixa do fim da transação; termina em RAISE 'OK' (desfaz tudo).
--   T1 R1 sem NF: assume o valor do banco (com a confirmação) e o desfazer 1:1 volta o valor previsto, programado, sem data
--   T2 R2 NF a MAIS: sem destino não grava (pergunta pronta); 'juros' = NF inteira + "Juros/multa da NF" no mesmo grupo; o desfazer do grupo
--      volta a NF e cancela os juros ('voltaram' no retorno)
--   T3 R2 NF a MENOS 'desconto': sem motivo não grava; com motivo a NF fica inteira e quitada (sem saldo), "Desconto obtido" sem caixa;
--      o desfazer volta a NF e cancela o desconto
--   T4 R2 NF a MENOS 'parcial' (D2-b i): divide; o desfazer junta e volta a programado
--   T5 o caso Edson sintético: 4 NFs inteiras + a NF de 5.250 "absorvendo" 386,65 — recusado sem destino (nada muda); com 'parcial' casa;
--      o desfazer do grupo volta os 5 a programado sem data e a NF a 5.250
--   T6 até R$ 1,00 é arredondamento (D3-a): a NF assume o centavo do banco e o desfazer volta o centavo
--   T7 D4-a (i): campo editado depois do casar fica com a edição; o resto volta; o motivo diz qual ficou
--   T8 "Ligar com o valor real": a NF não sobe para o valor do banco
--   T9 a regra "tem NF": guia (FGTS / e-Social) e recorrência sem documento = sem NF
--   T10 o motor de blocos não ganha antes (o dele é conciliacao_blocos) e o desfazer do bloco segue certo
--   T11 ACL: as internas fechadas; o Casar segue aberto a authenticated
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create function pg_temp.ext(p_valor numeric, p_data date) returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into public.extrato_bancario_v2 (id, cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
  values (v, '43f32d07-dba8-4670-900c-bf645440c04a', '131b8501-caf7-4964-b1b1-3f552ad2b75d', p_data, p_valor,
          case when p_valor < 0 then 'debito' else 'credito' end, 'SINT-CDE01-' || v, 'SINT CDE01');
  return v;
end $f$;
-- saída programada; p_nf = tipo de documento "Nota Fiscal" com número; p_rec = nasce de uma recorrência; p_desc = a descrição
create function pg_temp.lanc(p_valor numeric, p_nf boolean, p_rec boolean default false, p_desc text default 'SINT CDE01') returns uuid language plpgsql as $f$
declare v uuid; rec uuid;
begin
  if p_rec then
    insert into public.financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento,
      data_inicio, primeiro_vencimento, data_fim, ativo, tipo_valor)
    values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'SINT CDE01 rec', '131b8501-caf7-4964-b1b1-3f552ad2b75d',
            'SINT', p_valor, 5, date '2026-09-01', date '2026-10-05', date '2027-08-31', true, 'exato') returning id into rec;
  end if;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, sinal, data_competencia, data_vencimento,
    status_transacao, conta_bancaria_id, descricao, cenario, origem_lancamento, recorrencia_id, tipo_documento, numero_documento)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', '2-Saídas', p_valor, '-1', date '2026-10-01',
          date '2026-10-05', 'programado', '131b8501-caf7-4964-b1b1-3f552ad2b75d', p_desc, 'realizado',
          case when rec is null then 'manual' else 'recorrencia' end, rec,
          case when p_nf then 'Nota Fiscal' end, case when p_nf then 'SINT-' || floor(random() * 100000)::int end) returning id into v;
  return v;
end $f$;
create function pg_temp.st(p uuid) returns text language sql as $f$
  select round(abs(valor), 2) || ' ' || status_transacao || ' ' || coalesce(data_pagamento::text, 'sem data') || case when cancelado then ' cancelado' else '' end
    from public.financeiro_lancamentos_v2 where id = p
$f$;
create function pg_temp.item(p uuid, p_valor numeric, p_extra jsonb default '{}') returns jsonb language sql as $f$
  select jsonb_build_object('lancamento_id', p, 'valor', p_valor) || p_extra
$f$;
create function pg_temp.grupo(p_ext uuid) returns uuid language sql as $f$
  select grupo_id from public.conciliacao_bancaria_itens where extrato_id = p_ext and desfeito_em is null and grupo_id is not null limit 1
$f$;

DO $t$
DECLARE e uuid; l uuid; l2 uuid; l3 uuid; l4 uuid; l5 uuid; j uuid; r jsonb; ok boolean; g uuid; v text;
BEGIN
  -- T1 R1 sem NF
  l := pg_temp.lanc(800, false); e := pg_temp.ext(-812, date '2026-10-08');
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 812, '{"aceitar_valor_extrato":true}')), false, 'teste');
  set constraints all immediate; set constraints all deferred;
  if (r->>'ok')::boolean is not true or pg_temp.st(l) <> '812.00 realizado 2026-10-08' then raise exception 'T1 casar: % / %', r, pg_temp.st(l); end if;
  if not exists (select 1 from public.financeiro_baixas_no_vinculo b where b.lancamento_id = l and b.tipo = 'casar' and b.desfeita_em is null
                 and (b.antes->>'valor')::numeric = 800 and b.antes->>'status_transacao' = 'programado' and (b.depois->>'valor')::numeric = 812)
    then raise exception 'T1 antes/depois nao guardados'; end if;
  perform public.fn_desfazer_vinculo_extrato(e, 'teste T1');
  if pg_temp.st(l) <> '800.00 programado sem data' then raise exception 'T1 desfazer nao voltou: %', pg_temp.st(l); end if;

  -- T2 R2 NF a mais
  l := pg_temp.lanc(1000, true); e := pg_temp.ext(-1100, date '2026-10-09');
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 1100)), true, 'teste');
  if r->'pergunta_nf'->>'sentido' is distinct from 'a_mais' or r->'pergunta_nf'->'opcoes' <> '["juros"]'::jsonb then raise exception 'T2 simular: %', r; end if;
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 1100)), false, 'teste');
  set constraints all immediate; set constraints all deferred;
  if r->>'motivo' is distinct from 'nf_diferenca' or r->>'frase' not like 'A NF nº SINT-% vale R$ 1.000,00 e o banco pagou R$ 1.100,00: o valor da NF não muda.%'
     or pg_temp.st(l) <> '1000.00 programado sem data' or exists (select 1 from public.conciliacao_bancaria_itens c where c.extrato_id = e)
    then raise exception 'T2 gravou sem destino: % / %', r, pg_temp.st(l); end if;
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 1100, '{"destino":"juros"}')), false, 'teste');
  set constraints all immediate; set constraints all deferred;
  select b.irmao_id into j from public.financeiro_baixas_no_vinculo b where b.lancamento_id = l and b.tipo = 'juros' and b.desfeita_em is null;
  if (r->>'ok')::boolean is not true or pg_temp.st(l) <> '1000.00 realizado 2026-10-09' or j is null or pg_temp.st(j) <> '100.00 realizado 2026-10-09'
     or (select descricao from public.financeiro_lancamentos_v2 where id = j) not like 'Juros/multa da NF nº SINT-%'
     or (select pc.subcentro from public.financeiro_lancamentos_v2 x join public.financeiro_plano_contas pc on pc.id = x.plano_conta_id where x.id = j) <> 'Juros/multa por atraso'
     or (select count(*) from public.conciliacao_bancaria_itens c where c.extrato_id = e and c.desfeito_em is null and c.grupo_id is not null) <> 2
     or (select status from public.extrato_bancario_v2 where id = e) <> 'conciliado'
    then raise exception 'T2 juros: % / NF % / juros %', r, pg_temp.st(l), pg_temp.st(j); end if;
  r := public.fn_desfazer_grupo_conciliacao(pg_temp.grupo(e), 'teste T2');
  if pg_temp.st(l) <> '1000.00 programado sem data' or pg_temp.st(j) not like '% cancelado' or jsonb_array_length(r->'voltaram') <> 1
    then raise exception 'T2 desfazer: % / NF % / juros %', r, pg_temp.st(l), pg_temp.st(j); end if;

  -- T3 R2 NF a menos, desconto
  l := pg_temp.lanc(1000, true); e := pg_temp.ext(-900, date '2026-10-10');
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 900, '{"destino":"desconto"}')), false, 'teste');
  if r->>'motivo' is distinct from 'nf_diferenca' or r->>'frase' not like 'Para dar desconto de R$ 100,00 na NF nº SINT-%, escreva o motivo.' then raise exception 'T3 sem motivo: %', r; end if;
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 900, '{"destino":"desconto","motivo_desconto":"pagou à vista"}')), false, 'teste');
  set constraints all immediate; set constraints all deferred;
  select b.irmao_id into j from public.financeiro_baixas_no_vinculo b where b.lancamento_id = l and b.tipo = 'desconto' and b.desfeita_em is null;
  if (r->>'ok')::boolean is not true or pg_temp.st(l) <> '1000.00 realizado 2026-10-10' or j is null or pg_temp.st(j) <> '100.00 realizado 2026-10-10'
     or exists (select 1 from public.financeiro_lancamentos_v2 x where x.saldo_de_id = l)
     or (select tipo_operacao || ' ' || sem_movimentacao_caixa from public.financeiro_lancamentos_v2 where id = j) <> '1-Entradas true'
     or (select pc.subcentro from public.financeiro_lancamentos_v2 x join public.financeiro_plano_contas pc on pc.id = x.plano_conta_id where x.id = j) <> 'Desconto obtido'
     or exists (select 1 from public.conciliacao_bancaria_itens c where c.lancamento_id = j)
    then raise exception 'T3 desconto: % / NF % / desconto %', r, pg_temp.st(l), pg_temp.st(j); end if;
  perform public.fn_desfazer_vinculo_extrato(e, 'teste T3');
  if pg_temp.st(l) <> '1000.00 programado sem data' or pg_temp.st(j) not like '% cancelado' then raise exception 'T3 desfazer: NF % / desconto %', pg_temp.st(l), pg_temp.st(j); end if;

  -- T4 R2 NF a menos, parcial (divide e junta)
  l := pg_temp.lanc(1000, true); e := pg_temp.ext(-400, date '2026-10-11');
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 400, '{"destino":"parcial"}')), false, 'teste');
  set constraints all immediate; set constraints all deferred;
  if (r->>'ok')::boolean is not true or pg_temp.st(l) <> '400.00 realizado 2026-10-11'
     or (select pg_temp.st(x.id) from public.financeiro_lancamentos_v2 x where x.saldo_de_id = l and not x.cancelado) <> '600.00 programado sem data'
    then raise exception 'T4 parcial: % / %', r, pg_temp.st(l); end if;
  perform public.fn_desfazer_vinculo_extrato(e, 'teste T4');
  if pg_temp.st(l) <> '1000.00 programado sem data' or exists (select 1 from public.financeiro_lancamentos_v2 x where x.saldo_de_id = l and not x.cancelado)
    then raise exception 'T4 desfazer: %', pg_temp.st(l); end if;

  -- T5 o caso Edson sintético
  l := pg_temp.lanc(2900, true); l2 := pg_temp.lanc(980, true); l3 := pg_temp.lanc(1403.35, true); l4 := pg_temp.lanc(330, true);
  l5 := pg_temp.lanc(5250, true); e := pg_temp.ext(-6000, date '2026-10-08');
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 2900), pg_temp.item(l2, 980), pg_temp.item(l3, 1403.35), pg_temp.item(l4, 330),
                                                    pg_temp.item(l5, 386.65)), false, 'teste');
  set constraints all immediate; set constraints all deferred;
  if r->>'motivo' is distinct from 'nf_diferenca' or pg_temp.st(l5) <> '5250.00 programado sem data' or pg_temp.st(l) <> '2900.00 programado sem data'
    then raise exception 'T5 absorver gravou: % / %', r, pg_temp.st(l5); end if;
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 2900), pg_temp.item(l2, 980), pg_temp.item(l3, 1403.35), pg_temp.item(l4, 330),
                                                    pg_temp.item(l5, 386.65, '{"destino":"parcial"}')), false, 'teste');
  set constraints all immediate; set constraints all deferred;
  if (r->>'ok')::boolean is not true or pg_temp.st(l5) <> '386.65 realizado 2026-10-08' or pg_temp.st(l) <> '2900.00 realizado 2026-10-08'
    then raise exception 'T5 parcial: % / %', r, pg_temp.st(l5); end if;
  r := public.fn_desfazer_grupo_conciliacao(pg_temp.grupo(e), 'desfeito_no_espelho');
  v := pg_temp.st(l) || ' | ' || pg_temp.st(l2) || ' | ' || pg_temp.st(l3) || ' | ' || pg_temp.st(l4) || ' | ' || pg_temp.st(l5);
  if v <> '2900.00 programado sem data | 980.00 programado sem data | 1403.35 programado sem data | 330.00 programado sem data | 5250.00 programado sem data'
     or exists (select 1 from public.financeiro_lancamentos_v2 x where x.saldo_de_id = l5 and not x.cancelado) or jsonb_array_length(r->'voltaram') <> 5
    then raise exception 'T5 desfazer: % / %', v, r; end if;

  -- T6 arredondamento (D3-a)
  l := pg_temp.lanc(1159.18, true); e := pg_temp.ext(-1159.16, date '2026-10-12');
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 1159.16)), false, 'teste');
  set constraints all immediate; set constraints all deferred;
  if (r->>'ok')::boolean is not true or pg_temp.st(l) <> '1159.16 realizado 2026-10-12' then raise exception 'T6 arredondamento: % / %', r, pg_temp.st(l); end if;
  perform public.fn_desfazer_vinculo_extrato(e, 'teste T6');
  if pg_temp.st(l) <> '1159.18 programado sem data' then raise exception 'T6 desfazer: %', pg_temp.st(l); end if;

  -- T7 D4-a (i): editado depois do casar
  l := pg_temp.lanc(800, false); e := pg_temp.ext(-812, date '2026-10-13');
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 812, '{"aceitar_valor_extrato":true}')), false, 'teste');
  set constraints all immediate; set constraints all deferred;
  perform set_config('app.conc_dividindo', 'on', true);
  update public.financeiro_lancamentos_v2 set valor = 805 where id = l;
  perform set_config('app.conc_dividindo', 'off', true);
  perform public.fn_desfazer_vinculo_extrato(e, 'teste T7');
  if pg_temp.st(l) <> '805.00 programado sem data'
     or (select b.desfeita_motivo from public.financeiro_baixas_no_vinculo b where b.lancamento_id = l and b.tipo = 'casar') <> 'teste T7 · ficou como foi editado depois do casar: valor'
    then raise exception 'T7 D4-a: %', pg_temp.st(l); end if;

  -- T8 "Ligar com o valor real": a NF não sobe
  l := pg_temp.lanc(1000, true); e := pg_temp.ext(-1100, date '2026-10-14');
  ok := false;
  begin perform public.fn_conc_ligar_com_valor_real(e, l, null, true);
  exception when others then ok := sqlerrm like 'O extrato de R$ 1.100,00 é maior que a NF (R$ 1.000,00 em aberto) e o valor da NF não muda.%'; end;
  if not ok or pg_temp.st(l) <> '1000.00 programado sem data' then raise exception 'T8 valor real subiu a NF: %', pg_temp.st(l); end if;

  -- T9 a regra "tem NF"
  -- (a regra é STABLE: o lançamento nasce num comando e é lido no seguinte)
  l := pg_temp.lanc(1, true); l2 := pg_temp.lanc(1, false); l3 := pg_temp.lanc(1, true, false, 'FGTS');
  l4 := pg_temp.lanc(1, true, false, 'E-Social'); l5 := pg_temp.lanc(1, true, true);
  if not public._fn_lancamento_tem_nf(l) then raise exception 'T9 NF'; end if;
  if public._fn_lancamento_tem_nf(l2) then raise exception 'T9 sem NF'; end if;
  if public._fn_lancamento_tem_nf(l3) or public._fn_lancamento_tem_nf(l4) then raise exception 'T9 guia contou como NF'; end if;
  if public._fn_lancamento_tem_nf(l5) then raise exception 'T9 recorrencia sem documento contou como NF'; end if;

  -- T10 o motor de blocos
  l := pg_temp.lanc(700, false); e := pg_temp.ext(-700, date '2026-10-15');
  r := public.fn_conciliar_bloco(array[e], array[l], 'exato', false);
  set constraints all immediate; set constraints all deferred;
  if pg_temp.st(l) <> '700.00 realizado 2026-10-15' or exists (select 1 from public.financeiro_baixas_no_vinculo b where b.lancamento_id = l and b.tipo = 'casar')
    then raise exception 'T10 bloco: % / %', r, pg_temp.st(l); end if;
  perform public.fn_desfazer_bloco((r->>'bloco_id')::uuid, 'teste T10');
  if pg_temp.st(l) <> '700.00 programado sem data' then raise exception 'T10 desfazer do bloco: %', pg_temp.st(l); end if;

  -- T11 ACL
  if has_function_privilege('authenticated', 'public._fn_lancamento_tem_nf(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_conc_linha_da_nf(uuid, text, numeric, date, uuid, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_conc_guardar_antes(uuid, uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_espelho_casar(uuid, jsonb, boolean, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_espelho_casar(uuid, jsonb, boolean, text)', 'EXECUTE') then raise exception 'T11 ACL'; end if;

  RAISE EXCEPTION 'OK';
END $t$;
