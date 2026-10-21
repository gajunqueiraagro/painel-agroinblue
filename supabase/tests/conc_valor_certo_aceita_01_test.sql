-- CONC-VALOR-CERTO-ACEITA-01 — valor certo tambem muda num mes ("nao pode engessar"). Sintetico no cliente Teste, admin simulado;
-- `set constraints all immediate` dispara a baixa do fim da transacao; termina em RAISE 'OK' (desfaz tudo).
--   A1 valor certo, extrato MAIOR, sem confirmacao: nada grava e volta a frase pronta
--   A2 com confirmacao: o lancamento do mes vale o extrato, realizado na data do extrato, trilha (antes/depois, "valor do extrato");
--      a recorrencia NAO muda
--   A3 "a confirmar" (estimado) aceita direto, sem perguntar
--   A4 extrato MENOR divide
--   A5 "Casar com o banco": a simulacao traz a pergunta; gravar sem a confirmacao nao grava; com ela grava com trilha
--   A6 guarda de cliente (42501) e ACL (anon sem EXECUTE; o nucleo fechado)
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create function pg_temp.ext(p_valor numeric, p_data date) returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into public.extrato_bancario_v2 (id, cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
  values (v, '43f32d07-dba8-4670-900c-bf645440c04a', '131b8501-caf7-4964-b1b1-3f552ad2b75d', p_data, p_valor,
          case when p_valor < 0 then 'debito' else 'credito' end, 'SINT-CVC01-' || v, 'SINT CVC01');
  return v;
end $f$;
-- lancamento de saida programado; com p_tipo_valor, nasce de uma recorrencia desse tipo
create function pg_temp.lanc(p_valor numeric, p_tipo_valor text default null) returns uuid language plpgsql as $f$
declare v uuid; rec uuid;
begin
  if p_tipo_valor is not null then
    insert into public.financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento,
      data_inicio, primeiro_vencimento, data_fim, ativo, tipo_valor)
    values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'SINT CVC01 rec', '131b8501-caf7-4964-b1b1-3f552ad2b75d',
            'SINT', p_valor, 5, date '2026-09-01', date '2026-10-05', date '2027-08-31', true, p_tipo_valor) returning id into rec;
  end if;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, sinal, data_competencia, data_vencimento,
    status_transacao, conta_bancaria_id, descricao, cenario, origem_lancamento, recorrencia_id)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', '2-Saídas', p_valor, '-1', date '2026-10-01',
          date '2026-10-05', 'programado', '131b8501-caf7-4964-b1b1-3f552ad2b75d', 'SINT CVC01', 'realizado',
          case when rec is null then 'manual' else 'recorrencia' end, rec) returning id into v;
  return v;
end $f$;

DO $t$
DECLARE e uuid; l uuid; r jsonb; x record; ok boolean; msg text;
BEGIN
  -- A1 valor certo, maior, sem confirmacao
  l := pg_temp.lanc(300, 'exato'); e := pg_temp.ext(-320, date '2026-09-29');
  r := public.fn_conc_ligar_com_valor_real(e, l, null);
  if (r->>'precisa_confirmar')::boolean is not true
     or r->>'frase' is distinct from 'Este mês veio R$ 320,00 (previsto R$ 300,00). Ligar com o valor do extrato?' then raise exception 'A1 frase: %', r; end if;
  set constraints all immediate; set constraints all deferred;
  if (select round(abs(valor), 2) from public.financeiro_lancamentos_v2 where id = l) <> 300
     or exists (select 1 from public.conciliacao_bancaria_itens c where c.lancamento_id = l and c.desfeito_em is null)
     or exists (select 1 from public.financeiro_baixas_no_vinculo b where b.lancamento_id = l) then raise exception 'A1 gravou'; end if;

  -- A2 com confirmacao
  r := public.fn_conc_ligar_com_valor_real(e, l, null, true);
  set constraints all immediate; set constraints all deferred;
  select * into x from public.financeiro_lancamentos_v2 where id = l;
  if round(abs(x.valor), 2) <> 320 or x.status_transacao <> 'realizado' or x.data_pagamento is distinct from date '2026-09-29' then raise exception 'A2 lancamento: %', row_to_json(x); end if;
  if not exists (select 1 from public.financeiro_baixas_no_vinculo b where b.lancamento_id = l and b.tipo = 'valor_real'
                 and b.motivo = 'valor do extrato' and abs((b.antes->>'valor')::numeric) = 300 and abs((b.depois->>'valor')::numeric) = 320) then raise exception 'A2 trilha'; end if;
  if (select valor_base from public.financeiro_recorrencias where id = x.recorrencia_id) <> 300 then raise exception 'A2 a recorrencia mudou'; end if;

  -- A3 estimado aceita direto
  l := pg_temp.lanc(200, 'estimado'); e := pg_temp.ext(-231.40, date '2026-09-28');
  r := public.fn_conc_ligar_com_valor_real(e, l, null);
  set constraints all immediate; set constraints all deferred;
  if (r->>'precisa_confirmar') is not null or (select round(abs(valor), 2) || status_transacao from public.financeiro_lancamentos_v2 where id = l) <> '231.40realizado'
    then raise exception 'A3 estimado: %', r; end if;

  -- A4 menor divide
  l := pg_temp.lanc(300, 'exato'); e := pg_temp.ext(-250, date '2026-09-29');
  r := public.fn_conc_ligar_com_valor_real(e, l, null);
  set constraints all immediate; set constraints all deferred;
  if (select round(abs(valor), 2) from public.financeiro_lancamentos_v2 where id = l) <> 250
     or (select round(abs(valor), 2) from public.financeiro_lancamentos_v2 where saldo_de_id = l) <> 50 then raise exception 'A4 menor nao dividiu'; end if;

  -- A5 "Casar com o banco" (avulso de valor certo)
  l := pg_temp.lanc(500); e := pg_temp.ext(-540, date '2026-09-30');
  r := public.fn_espelho_casar(e, jsonb_build_array(jsonb_build_object('lancamento_id', l, 'valor', 540)), true, 'teste');
  if (r->>'ok')::boolean is not true or r->'pergunta'->>'frase' is distinct from 'Este mês veio R$ 540,00 (previsto R$ 500,00). Ligar com o valor do extrato?'
    then raise exception 'A5 simulacao: %', r; end if;
  r := public.fn_espelho_casar(e, jsonb_build_array(jsonb_build_object('lancamento_id', l, 'valor', 540)), false, 'teste');
  set constraints all immediate; set constraints all deferred;
  if r->>'motivo' is distinct from 'confirmar_valor_extrato' or (select round(abs(valor), 2) from public.financeiro_lancamentos_v2 where id = l) <> 500
     or exists (select 1 from public.conciliacao_bancaria_itens c where c.lancamento_id = l and c.desfeito_em is null) then raise exception 'A5 gravou sem confirmar: %', r; end if;
  r := public.fn_espelho_casar(e, jsonb_build_array(jsonb_build_object('lancamento_id', l, 'valor', 540, 'aceitar_valor_extrato', true)), false, 'teste');
  set constraints all immediate; set constraints all deferred;
  if (r->>'ok')::boolean is not true or (select round(abs(valor), 2) || status_transacao from public.financeiro_lancamentos_v2 where id = l) <> '540.00realizado'
     or not exists (select 1 from public.financeiro_baixas_no_vinculo b where b.lancamento_id = l and b.tipo = 'valor_real' and b.motivo = 'valor do extrato')
    then raise exception 'A5 com confirmacao: %', r; end if;

  -- A6 guarda e ACL
  -- a guarda propria: sem acesso, nem a PERGUNTA (que diz os valores) sai — extrato maior, sem confirmacao, recusa 42501
  l := pg_temp.lanc(300); e := pg_temp.ext(-320, date '2026-09-30');
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  ok := false; begin perform public.fn_conc_ligar_com_valor_real(e, l, null); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'A6 sem tenant'; end if;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  if has_function_privilege('anon', 'public.fn_conc_ligar_com_valor_real(uuid, uuid, text, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_conc_valor_do_extrato(uuid, uuid, numeric, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_conc_ligar_com_valor_real(uuid, uuid, text, boolean)', 'EXECUTE') then raise exception 'A6 ACL'; end if;

  RAISE EXCEPTION 'OK';
END $t$;
