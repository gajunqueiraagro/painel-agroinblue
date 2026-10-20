-- FIN-CONTRATO-NC-SALVAR-01 — a captacao segue o CREDITADO EM CONTA, e o item 1 do 8.233.040 (RRCC, 74567fe0), com o OK do Gabriel de 20/10/2026.
--   1. `_fn_financiamento_salvar_cabecalho_exec` (f252549b… -> 76b57c80…): ao atualizar a captacao que existe, o VALOR dela nao e' mais
--      reescrito com o valor do contrato (data, conta, credor e plano seguem acompanhando o cabecalho); ao criar uma captacao nova, o valor
--      e' o das liberacoes vivas "em conta" do contrato, e so' na falta delas o valor do contrato. Regra universal: mudar o valor do contrato
--      no cabecalho nao mexe na captacao. (Nasce do 8.233.040: o Salvar cabecalho de 20/10 10:42 levou a captacao de 592.000,00 a 600.022,50.)
--   2. 8.233.040: a captacao a90f4135 volta a 592.000,00 (o que entrou na conta 219dbf52 em 26/09/2025).
--   3. Segunda liberacao de 8.022,50 sem caixa (forma 'fornecedor', credor Sicoob), pelo dono `fn_financiamento_liberacao_salvar`: liberado
--      600.022,50; saldo 480.018,00.
--   4. A despesa de 8.022,50 "encargos da contratação (IOF/tarifa) — a identificar com o banco" em Juros de Financiamento Pecuaria, sem conta
--      bancaria e sem caixa, realizada em 26/09/2025 (gravada aqui; trilha = este arquivo + o `audit_log` do lancamento), ligada ao contrato
--      pelo vinculo de encargo (`fn_contrato_encargo_vincular`, papel 'iof').
--   5. A parcela 1 segue os lancamentos dela (os dois realizados em 17/08/2026): status 'pago' e pagamento 17/08/2026 — sem isso o motor das
--      parcelas, que deriva o status do lancamento da coluna da parcela, devolveria os dois lancamentos a 'previsto' na proxima vez que rodasse.
-- Guarda: o estado medido em 20/10, senao aborta. Patch guardado por md5 (origem, as duas ancoras 1x, destino); ACL igual.

set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create or replace function pg_temp._troca(t text, a text, b text, rotulo text) returns text language plpgsql as $f$
begin
  if (length(t) - length(replace(t, a, ''))) / length(a) <> 1 then raise exception 'ancora % nao casa 1x', rotulo; end if;
  return replace(t, a, b);
end $f$;

do $mig$
declare
  v_oid oid; v_src text; v_new text; v_acl text;
  fin constant uuid := '74567fe0-3e09-4f22-84a5-2513d6557d27';
  cap constant uuid := 'a90f4135-fd51-49ee-b652-129d0e9360a5';
  sicoob constant uuid := '157994ca-d6a5-47ce-be7f-6ebce9b70512';
  p1 uuid; v_desp uuid; r jsonb; n int;
begin
  -- 1. o salvar do cabecalho
  v_oid := 'public._fn_financiamento_salvar_cabecalho_exec(uuid, jsonb)'::regprocedure;
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) <> '76b57c803f005c42a5cb1d7928980eed' then
    if md5(v_src) <> 'f252549b82d9e795ebce7ac14b7f9507' then raise exception 'cabecalho: origem inesperada %', md5(v_src); end if;
    v_new := pg_temp._troca(pg_get_functiondef(v_oid),
      $a$        update public.financeiro_lancamentos_v2 set valor = n.valor_total, data_competencia = n.data_contrato, data_pagamento = n.data_contrato,$a$,
      $a$        -- FIN-CONTRATO-NC-SALVAR-01: a captacao segue o CREDITADO EM CONTA, nunca o valor do contrato (o valor dela nao e' tocado aqui)
        update public.financeiro_lancamentos_v2 set data_competencia = n.data_contrato, data_pagamento = n.data_contrato,$a$, 'C1');
    v_new := pg_temp._troca(v_new,
      $a$      values (n.cliente_id, n.fazenda_id, n.id, n.conta_bancaria_id, null, n.credor_id, '1-Entradas', 1, n.valor_total, n.data_contrato,$a$,
      $a$      values (n.cliente_id, n.fazenda_id, n.id, n.conta_bancaria_id, null, n.credor_id, '1-Entradas', 1,
        coalesce((select sum(l.valor) from public.financiamento_liberacoes l where l.financiamento_id = p_id and l.forma = 'conta' and l.cancelado_em is null), n.valor_total), n.data_contrato,$a$, 'C2');
    execute v_new;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> '76b57c803f005c42a5cb1d7928980eed' then raise exception 'cabecalho: destino inesperado %', md5(v_src); end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then raise exception 'cabecalho: ACL mudou'; end if;
  end if;

  -- guarda do dado
  if (select valor from financeiro_lancamentos_v2 where id = cap) <> 600022.50
     or (select count(*) from financiamento_liberacoes where financiamento_id = fin and cancelado_em is null) <> 1
     or (select count(*) from financiamento_encargos where financiamento_id = fin and desfeito_em is null) <> 0
  then raise exception '8233040: estado diferente do medido em 20/10'; end if;
  select id into p1 from financiamento_parcelas where financiamento_id = fin and status <> 'cancelado' and numero_parcela = 1;
  if not public._fn_parcela_esta_paga(p1) then raise exception '8233040: a parcela 1 nao esta paga pelos lancamentos'; end if;

  -- 2. a captacao volta ao creditado
  update financeiro_lancamentos_v2 set valor = 592000.00, updated_by = '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', updated_at = now() where id = cap and valor = 600022.50;
  get diagnostics n = row_count;
  if n <> 1 then raise exception '8233040: captacao em % linhas', n; end if;

  -- 3. a liberacao dos encargos, sem caixa
  perform public.fn_financiamento_liberacao_salvar(fin, null, date '2025-10-01', 8022.50, 'fornecedor', null, sicoob, null, null,
    'encargos da contratação (IOF/tarifa) — a identificar com o banco');

  -- 4. a despesa dos encargos, sem conta e sem caixa, ligada ao contrato como encargo
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id, favorecido_id, tipo_operacao, sinal, valor,
         data_competencia, data_vencimento, data_pagamento, status_transacao, cenario, sem_movimentacao_caixa, plano_conta_id, descricao, observacao,
         origem_lancamento, created_by, updated_by)
  select f.cliente_id, f.fazenda_id, null, null, sicoob, '2-Saídas', '-1', 8022.50, date '2025-09-26', date '2025-09-26', date '2025-09-26',
         'realizado', 'realizado', true, f.plano_juros_id, 'Encargos da contratação (IOF/tarifa) · 8.233.040 · Giro Rural',
         'a identificar com o banco · não passou pela conta (retido na liberação de 600.022,50; creditados 592.000,00)', 'manual',
         '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e'
    from financiamentos f where f.id = fin
  returning id into v_desp;
  r := public.fn_contrato_encargo_vincular(fin, jsonb_build_array(jsonb_build_object('lancamento_id', v_desp, 'papel', 'iof')), false);
  if (select count(*) from financiamento_encargos where financiamento_id = fin and lancamento_id = v_desp and desfeito_em is null) <> 1
  then raise exception '8233040: encargo nao vinculou: %', r; end if;

  -- 5. a parcela 1 segue os lancamentos
  update financiamento_parcelas set status = 'pago', data_pagamento = date '2026-08-17' where id = p1 and status = 'pendente';

  if (public._fn_financiamento_saldo(fin, current_date)->>'saldo')::numeric <> 480018.00
  then raise exception '8233040: saldo %', public._fn_financiamento_saldo(fin, current_date); end if;
end $mig$;
