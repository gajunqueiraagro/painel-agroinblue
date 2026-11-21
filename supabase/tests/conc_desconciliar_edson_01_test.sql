-- CONC-DESCONCILIAR-EDSON-01 — o casar pelas REGRAS R1–R3. Sintético no cliente Teste, admin simulado; `set constraints all immediate`
-- dispara a baixa do fim da transação; termina em RAISE 'OK' (desfaz tudo).
--   T1 R1 sem NF: assume o valor do banco (com a confirmação) e o desfazer 1:1 volta o valor previsto, programado, sem data
--   T2 R2 NF a MAIS: sem destino não grava (pergunta pronta); 'juros' = NF inteira + "Juros/multa da NF" no mesmo grupo; o desfazer do grupo
--      volta a NF e cancela os juros ('voltaram' no retorno)
--   T3 R2 NF a MENOS 'desconto': sem motivo não grava; com motivo (115580, BAIXA-DESCONTO-BANCO-01) a NF fica com o que o banco pagou
--      (ligada ao extrato, sem resto) e a diferença vira a "parte paga com desconto" (irmã, realizada, SEM CAIXA, sem vínculo), mais o
--      "Desconto obtido" sem caixa; o desfazer volta a NF ao valor cheio e cancela a parte e o desconto
--   T4 R2 NF a MENOS 'parcial' (D2-b i): divide; o desfazer junta e volta a programado
--   T5 o caso Edson sintético: 4 NFs inteiras + a NF de 5.250 "absorvendo" 386,65 — recusado sem destino (nada muda); com 'parcial' casa;
--      o desfazer do grupo volta os 5 a programado sem data e a NF a 5.250
--   T6 até R$ 1,00 é arredondamento (D3-a): a NF assume o centavo do banco e o desfazer volta o centavo
--   T7 D4-a (i): campo editado depois do casar fica com a edição; o resto volta; o motivo diz qual ficou
--   T8 "Ligar com o valor real": a NF não sobe para o valor do banco
--   T9 a regra "tem NF": guia (FGTS / e-Social) e recorrência sem documento = sem NF
--   T10 o motor de blocos não ganha antes (o dele é conciliacao_blocos) e o desfazer do bloco segue certo
--   T11 ACL: as internas fechadas; o Casar segue aberto a authenticated
--   (115560: o "É juros/multa" lança em "Despesas Financeiras Administrativo", a conta que já existia)
--   T12 (115550, FILA 18/11 09:22) NF a mais com "taxa": sem conta não grava; conta de entrada recusa; com a conta de saída escolhida =
--       NF inteira + "Taxa (sem nota) da NF nº X" naquela conta, no mesmo grupo; o desfazer cancela a taxa e volta a NF
--   T13 (115570, FILA 18/11 13:10/13:12) NF a mais com "outra nota (falta lançar)" — o caso Luiz Gustavo: NF 1.404,00 × PIX 3.404,16. Com NF
--       não sai a pergunta "Ligar com o valor do extrato"; notas com valor que não fecham recusam; "270, 272" sem valor = 1 linha "Falta nota
--       nº 270, 272 · …" no mesmo grupo, na pendência até anexar; com o valor de cada = 2 linhas; o desfazer cancela as linhas e esvazia a pendência
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
  if r->'pergunta_nf'->>'sentido' is distinct from 'a_mais' or r->'pergunta_nf'->'opcoes' <> '["juros","taxa","outra_nota"]'::jsonb or r ? 'pergunta' then raise exception 'T2 simular: %', r; end if;
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
     or (select pc.subcentro from public.financeiro_lancamentos_v2 x join public.financeiro_plano_contas pc on pc.id = x.plano_conta_id where x.id = j) <> 'Despesas Financeiras Administrativo'
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
  select x.id into l5 from public.financeiro_lancamentos_v2 x where x.saldo_de_id = l and x.origem_tipo = 'conc:desconto_parte' and x.cancelado is not true;
  if (r->>'ok')::boolean is not true or pg_temp.st(l) <> '900.00 realizado 2026-10-10' or j is null or pg_temp.st(j) <> '100.00 realizado 2026-10-10'
     or l5 is null or pg_temp.st(l5) <> '100.00 realizado 2026-10-10'
     or (select sem_movimentacao_caixa from public.financeiro_lancamentos_v2 where id = l5) is not true
     or exists (select 1 from public.conciliacao_bancaria_itens c where c.lancamento_id = l5)
     or (select sum(c.valor_aplicado) from public.conciliacao_bancaria_itens c where c.lancamento_id = l and c.desfeito_em is null) <> 900
     or (select count(*) from public.financeiro_lancamentos_v2 x where x.saldo_de_id = l) <> 1
     or (select tipo_operacao || ' ' || sem_movimentacao_caixa from public.financeiro_lancamentos_v2 where id = j) <> '1-Entradas true'
     or (select pc.subcentro from public.financeiro_lancamentos_v2 x join public.financeiro_plano_contas pc on pc.id = x.plano_conta_id where x.id = j) <> 'Desconto obtido'
     or exists (select 1 from public.conciliacao_bancaria_itens c where c.lancamento_id = j)
    then raise exception 'T3 desconto: % / NF % / desconto %', r, pg_temp.st(l), pg_temp.st(j); end if;
  perform public.fn_desfazer_vinculo_extrato(e, 'teste T3');
  if pg_temp.st(l) <> '1000.00 programado sem data' or pg_temp.st(j) not like '% cancelado' or pg_temp.st(l5) not like '% cancelado'
    then raise exception 'T3 desfazer: NF % / desconto % / parte %', pg_temp.st(l), pg_temp.st(j), pg_temp.st(l5); end if;

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
     or has_function_privilege('authenticated', 'public._fn_conc_parte_do_desconto(uuid, numeric, date, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_conc_outras_notas(numeric, jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_conc_outra_nota_linha(uuid, numeric, date, uuid, text[], text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_conc_outras_notas_pendentes(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_conc_outras_notas_pendentes(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_espelho_casar(uuid, jsonb, boolean, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_espelho_casar(uuid, jsonb, boolean, text)', 'EXECUTE') then raise exception 'T11 ACL'; end if;

  -- T12 a taxa (cartão pagou 109,00 por uma NF de 87,20)
  l := pg_temp.lanc(87.20, true); e := pg_temp.ext(-109, date '2026-10-16');
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 109, '{"destino":"taxa"}')), false, 'teste');
  if r->>'motivo' is distinct from 'nf_diferenca' then raise exception 'T12 taxa sem conta gravou: %', r; end if;
  ok := false;
  begin
    perform public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 109, jsonb_build_object('destino', 'taxa', 'plano_conta_id',
      (select id from public.financeiro_plano_contas where cliente_id is null and ativo and subcentro = 'Rendimentos Financeiros')))), false, 'teste');
  exception when others then ok := sqlerrm like 'Escolha a conta (subcentro) de saída da taxa.%'; end;
  if not ok then raise exception 'T12 conta de entrada aceita'; end if;
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 109, jsonb_build_object('destino', 'taxa', 'plano_conta_id',
      (select id from public.financeiro_plano_contas where cliente_id is null and ativo and subcentro = 'Despesas Financeiras Administrativo')))), false, 'teste');
  set constraints all immediate; set constraints all deferred;
  select b.irmao_id into j from public.financeiro_baixas_no_vinculo b where b.lancamento_id = l and b.tipo = 'taxa' and b.desfeita_em is null;
  if (r->>'ok')::boolean is not true or pg_temp.st(l) <> '87.20 realizado 2026-10-16' or j is null or pg_temp.st(j) <> '21.80 realizado 2026-10-16'
     or (select descricao from public.financeiro_lancamentos_v2 where id = j) not like 'Taxa (sem nota) da NF nº SINT-%'
     or (select pc.subcentro from public.financeiro_lancamentos_v2 x join public.financeiro_plano_contas pc on pc.id = x.plano_conta_id where x.id = j) <> 'Despesas Financeiras Administrativo'
     or (select count(*) from public.conciliacao_bancaria_itens c where c.extrato_id = e and c.desfeito_em is null and c.grupo_id is not null) <> 2
    then raise exception 'T12 taxa: % / NF % / taxa %', r, pg_temp.st(l), pg_temp.st(j); end if;
  r := public.fn_desfazer_grupo_conciliacao(pg_temp.grupo(e), 'teste T12');
  if pg_temp.st(l) <> '87.20 programado sem data' or pg_temp.st(j) not like '% cancelado' then raise exception 'T12 desfazer: NF % / taxa %', pg_temp.st(l), pg_temp.st(j); end if;

  -- T13 outra nota (NF-e 585 de peças 1.404,00 + NFS-e 270/272 de serviço no mesmo PIX de 3.404,16)
  l := pg_temp.lanc(1404, true); e := pg_temp.ext(-3404.16, date '2026-10-20');
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 3404.16)), true, 'teste');
  if r ? 'pergunta' or r->'pergunta_nf'->'opcoes' <> '["juros","taxa","outra_nota"]'::jsonb
     or r->'pergunta_nf'->>'frase' not like '%outra nota do fornecedor que falta lançar.' then raise exception 'T13 simular: %', r; end if;
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 3404.16, '{"destino":"outra_nota","outras_notas":[{"numero":"270","valor":1000},{"numero":"272","valor":900}]}')), false, 'teste');
  if r->>'motivo' is distinct from 'outra_nota_soma' or r->>'frase' <> 'As notas somam R$ 1.900,00 e a diferença é R$ 2.000,16. Acerte os valores ou deixe em branco o de uma delas.'
     or pg_temp.st(l) <> '1404.00 programado sem data' then raise exception 'T13 soma errada gravou: % / %', r, pg_temp.st(l); end if;
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 3404.16, '{"destino":"outra_nota","outras_notas":[{"numero":"270, 272"}]}')), false, 'teste');
  set constraints all immediate; set constraints all deferred;
  select b.irmao_id into j from public.financeiro_baixas_no_vinculo b where b.lancamento_id = l and b.tipo = 'outra_nota' and b.desfeita_em is null;
  if (r->>'ok')::boolean is not true or pg_temp.st(l) <> '1404.00 realizado 2026-10-20' or j is null or pg_temp.st(j) <> '2000.16 realizado 2026-10-20'
     or (select descricao || ' | ' || numero_documento || ' | ' || origem_tipo || ' | ' || coalesce(plano_conta_id::text, 'a classificar')
           from public.financeiro_lancamentos_v2 where id = j) <> 'Falta nota nº 270, 272 · sem fornecedor · pago 20/10/2026 | 270, 272 | conc:outra_nota | a classificar'
     or (select count(*) from public.conciliacao_bancaria_itens c where c.extrato_id = e and c.desfeito_em is null and c.grupo_id is not null) <> 2
     or (select status from public.extrato_bancario_v2 where id = e) <> 'conciliado'
    then raise exception 'T13 outra nota: % / NF % / linha %', r, pg_temp.st(l), pg_temp.st(j); end if;
  r := public.fn_conc_outras_notas_pendentes('43f32d07-dba8-4670-900c-bf645440c04a');
  if not exists (select 1 from jsonb_array_elements(r) p where (p->>'lancamento_id')::uuid = j and p->'numeros' = '["270","272"]'::jsonb
                   and p->>'frase' = 'Anexar a nota nº 270, 272 de sem fornecedor (R$ 2.000,16, pago em 20/10/2026)')
    then raise exception 'T13 pendencia: %', r; end if;
  r := public.fn_desfazer_grupo_conciliacao(pg_temp.grupo(e), 'teste T13');
  if pg_temp.st(l) <> '1404.00 programado sem data' or pg_temp.st(j) not like '% cancelado'
     or exists (select 1 from jsonb_array_elements(public.fn_conc_outras_notas_pendentes('43f32d07-dba8-4670-900c-bf645440c04a')) p where (p->>'lancamento_id')::uuid = j)
    then raise exception 'T13 desfazer: NF % / linha %', pg_temp.st(l), pg_temp.st(j); end if;
  -- com o valor de cada nota: uma linha por nota
  r := public.fn_espelho_casar(e, jsonb_build_array(pg_temp.item(l, 3404.16, '{"destino":"outra_nota","outras_notas":[{"numero":"270","valor":1200.16},{"numero":"272","valor":800}]}')), false, 'teste');
  set constraints all immediate; set constraints all deferred;
  v := (select string_agg(x.numero_documento || '=' || x.valor, ' ' order by x.numero_documento) from public.financeiro_baixas_no_vinculo b
          join public.financeiro_lancamentos_v2 x on x.id = b.irmao_id where b.lancamento_id = l and b.tipo = 'outra_nota' and b.desfeita_em is null);
  if (r->>'ok')::boolean is not true or v is distinct from '270=1200.16 272=800.00'
     or (select count(*) from public.conciliacao_bancaria_itens c where c.extrato_id = e and c.desfeito_em is null and c.grupo_id is not null) <> 3
    then raise exception 'T13 duas notas: % / %', r, v; end if;
  r := public.fn_desfazer_grupo_conciliacao(pg_temp.grupo(e), 'teste T13b');
  if pg_temp.st(l) <> '1404.00 programado sem data' or exists (select 1 from public.financeiro_baixas_no_vinculo b join public.financeiro_lancamentos_v2 x
       on x.id = b.irmao_id where b.lancamento_id = l and b.tipo = 'outra_nota' and x.cancelado is not true)
    then raise exception 'T13b desfazer: %', pg_temp.st(l); end if;

  RAISE EXCEPTION 'OK';
END $t$;
