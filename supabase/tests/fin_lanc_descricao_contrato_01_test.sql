-- FIN-LANC-DESCRICAO-CONTRATO-01 — a descricao dos gerados segue o cadastro do contrato. Sintetico no Teste; termina em RAISE 'OK'.
--   D1 nº sem digito sai da descricao (motor: amortizacao e juros)
--   D2 renomear nº e descricao do contrato reescreve os gerados (gatilho)
--   D3 lancamento VINCULADO (nao gerado) a' parcela nao muda
--   D4 compra parcelada: o gatilho nao toca; o formato segue "<descricao> i/N"
--   D5 captacao: ligar o lancamento ao contrato escreve "Captação · nº · descricao"
--   D6 trocar a natureza para consorcio reescreve no formato do consorcio
--   D7 a tabela de antes do backfill esta' preenchida e sem " ·  · "; as internas fechadas a authenticated
set local statement_timeout = '30s';
set local lock_timeout = '2s';
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  fz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  fin uuid; par uuid; p1 uuid; p2 uuid; lm uuid; lc uuid; lp uuid; v jsonb; d text;
BEGIN
  insert into public.financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato,
                                     valor_total, valor_entrada, data_contrato, data_primeira_parcela, total_parcelas, status, conta_bancaria_id)
  values (k, fz, 'financiamento', 'pecuaria', 'SINT DESC', 'Atualizar', 2000, 0, date '2031-01-10', date '2031-02-15', 2, 'ativo', cta)
  returning id into fin;
  insert into public.financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  values (fin, k, 1, date '2031-02-15', 1000, 50, 1050, 'pendente') returning id into p1;
  insert into public.financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  values (fin, k, 2, date '2031-03-15', 1000, 50, 1050, 'pendente') returning id into p2;
  v := public.fn_reconciliar_financiamento(fin, false, true);

  /* D1 */
  select l.descricao into d from public.financiamento_parcelas q join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.id = p1;
  if d is distinct from 'Amortização 1/2 · SINT DESC' then raise exception 'D1 amortizacao: %', d; end if;
  select l.descricao into d from public.financiamento_parcelas q join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_juros_id where q.id = p1;
  if d is distinct from 'Juros 1/2 · SINT DESC' then raise exception 'D1 juros: %', d; end if;

  /* D3 prepara: a parcela 2 passa a apontar um lancamento do operador (como o vincular do 4b deixa) */
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_vencimento,
                                                data_pagamento, status_transacao, conta_bancaria_id, cenario, origem_lancamento)
  values (k, fz, '2-Saídas', 'SINT DO EXTRATO', 1050, date '2031-03-15', date '2031-03-15', date '2031-03-15', 'realizado', cta, 'realizado', 'manual')
  returning id into lm;
  update public.financiamento_parcelas set lancamento_id = lm where id = p2;

  /* D2 */
  update public.financiamentos set numero_contrato = '512-9', descricao = 'SINT NOVO' where id = fin;
  select l.descricao into d from public.financiamento_parcelas q join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.id = p1;
  if d is distinct from 'Amortização 1/2 · 512-9 · SINT NOVO' then raise exception 'D2 amortizacao: %', d; end if;
  select l.descricao into d from public.financiamento_parcelas q join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_juros_id where q.id = p2;
  if d is distinct from 'Juros 2/2 · 512-9 · SINT NOVO' then raise exception 'D2 juros: %', d; end if;

  /* D3 */
  if (select descricao from public.financeiro_lancamentos_v2 where id = lm) is distinct from 'SINT DO EXTRATO' then raise exception 'D3 vinculado mudou'; end if;

  /* D5 */
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_pagamento,
                                                status_transacao, conta_destino_id, cenario, origem_lancamento, origem_tipo, financiamento_id)
  values (k, fz, '1-Entradas', 'SINT NOVO', 2000, date '2031-01-10', date '2031-01-10', 'realizado', cta, 'realizado', 'financiamento', 'financiamento_captacao', fin)
  returning id into lc;
  update public.financiamentos set lancamento_captacao_id = lc where id = fin;
  if (select descricao from public.financeiro_lancamentos_v2 where id = lc) is distinct from 'Captação · 512-9 · SINT NOVO' then
    raise exception 'D5 captacao: %', (select descricao from public.financeiro_lancamentos_v2 where id = lc); end if;

  /* D6 */
  update public.financiamentos set natureza = 'consorcio' where id = fin;
  select l.descricao into d from public.financiamento_parcelas q join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.id = p1;
  if d is distinct from 'Consórcio · Parc 1/2' then raise exception 'D6 consorcio: %', d; end if;

  /* D4 */
  insert into public.financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, valor_total, valor_entrada,
                                     data_contrato, data_primeira_parcela, total_parcelas, status)
  values (k, fz, 'parcelamento', 'pecuaria', 'SINT COMPRA', 100, 0, date '2031-01-10', date '2031-02-15', 1, 'ativo') returning id into par;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_vencimento,
                                                status_transacao, conta_bancaria_id, cenario, origem_tipo, financiamento_id)
  values (k, fz, '2-Saídas', 'SINT COMPRA 1/1', 100, date '2031-02-15', date '2031-02-15', 'programado', cta, 'realizado', 'parcela_principal', par)
  returning id into lp;
  insert into public.financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status, lancamento_id)
  values (par, k, 1, date '2031-02-15', 100, 0, 100, 'pendente', lp);
  if public._fn_financiamento_descricao_lancamento('principal', 'parcelamento', null, 'SINT COMPRA', 1, 1) is distinct from 'SINT COMPRA 1/1' then
    raise exception 'D4 formato da compra'; end if;
  update public.financiamentos set descricao = 'SINT COMPRA NOVA' where id = par;
  if (select descricao from public.financeiro_lancamentos_v2 where id = lp) is distinct from 'SINT COMPRA 1/1' then raise exception 'D4 gatilho tocou a compra'; end if;

  /* D7 */
  if (select count(*) from public.fin_lanc_descricao_contrato_backfill) = 0 then raise exception 'D7 backup vazio'; end if;
  if exists (select 1 from public.fin_lanc_descricao_contrato_backfill where descricao_nova like '% ·  · %' or descricao_nova like '% · ' or descricao_nova ~* '· (Atualizar|Pendente|verificar|None) ·')
    then raise exception 'D7 pedaco vazio ou numero lixo'; end if;
  if has_function_privilege('authenticated', 'public._fn_financiamento_redescrever(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_financiamento_redescrever_trg()', 'execute')
     or has_function_privilege('anon', 'public._fn_financiamento_descricao_lancamento(text, text, text, text, integer, integer, text)', 'execute')
     or has_table_privilege('authenticated', 'public.fin_lanc_descricao_contrato_backfill', 'select') then raise exception 'D7 ACL'; end if;

  RAISE EXCEPTION 'OK';
END $t$;
