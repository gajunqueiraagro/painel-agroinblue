-- FIN-CONTRATO-JUROS-SYNC-01 — mudar o valor do lançamento vinculado à parcela de FINANCIAMENTO atualiza a parcela; o resto não.
--   S1 juros: o lançamento dos juros vai de 100 a 80 -> parcela valor_juros 80, valor_total = principal + 80
--   S2 principal: o lançamento do principal vai de 500 a 510 -> valor_principal 510, total 590
--   S3 lançamento sem parcela: muda de valor e nenhuma parcela muda
--   S4 parcelamento: o lançamento da parcela muda e a parcela NÃO (o dono dele é fn_parcelamento_editar_parcelas)
--   S5 lançamento cancelado: não mexe na parcela; contrato de outro cliente nunca é tocado (guarda de cliente)
--   S6 a correção da parcela 3 do C_14130608-0 ficou (juros 128.579,30, total 357.916,03); sem sobra (RAISE no fim, ROLLBACK)
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  c_teste constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; v_fin uuid; v_parc uuid; v_lp uuid; v_lj uuid; v_solto uuid; v_fin2 uuid; v_parc2 uuid; v_l2 uuid; r record;
begin
  select id into v_faz from public.fazendas where cliente_id = c_teste order by created_at limit 1;
  if v_faz is null then raise exception 'sem fazenda no cliente Teste'; end if;

  insert into public.financiamentos (cliente_id, descricao, natureza, status) values (c_teste, 'SINT JUROS SYNC', 'financiamento', 'ativo') returning id into v_fin;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, descricao, financiamento_id)
    values (c_teste, v_faz, '2-Saídas', 500, 'SINT principal', v_fin) returning id into v_lp;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, descricao, financiamento_id)
    values (c_teste, v_faz, '2-Saídas', 100, 'SINT juros', v_fin) returning id into v_lj;
  insert into public.financiamento_parcelas (financiamento_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status, lancamento_id, lancamento_juros_id)
    values (v_fin, 1, '2026-12-10', 500, 100, 600, 'pendente', v_lp, v_lj) returning id into v_parc;

  /* S1 */
  update public.financeiro_lancamentos_v2 set valor = 80 where id = v_lj;
  select * into r from public.financiamento_parcelas where id = v_parc;
  if r.valor_juros is distinct from 80.00 or r.valor_total is distinct from 580.00 or r.valor_principal is distinct from 500.00 then raise exception 'S1: %', r; end if;
  /* S2 */
  update public.financeiro_lancamentos_v2 set valor = 510 where id = v_lp;
  select * into r from public.financiamento_parcelas where id = v_parc;
  if r.valor_principal is distinct from 510.00 or r.valor_total is distinct from 590.00 then raise exception 'S2: %', r; end if;

  /* S3 */
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, descricao)
    values (c_teste, v_faz, '2-Saídas', 33, 'SINT solto') returning id into v_solto;
  update public.financeiro_lancamentos_v2 set valor = 34 where id = v_solto;
  select * into r from public.financiamento_parcelas where id = v_parc;
  if r.valor_total is distinct from 590.00 then raise exception 'S3: parcela mudou %', r; end if;

  /* S4 */
  insert into public.financiamentos (cliente_id, descricao, natureza, status) values (c_teste, 'SINT PARCELAMENTO', 'parcelamento', 'ativo') returning id into v_fin2;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, descricao, financiamento_id)
    values (c_teste, v_faz, '2-Saídas', 200, 'SINT parcela', v_fin2) returning id into v_l2;
  insert into public.financiamento_parcelas (financiamento_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status, lancamento_id)
    values (v_fin2, 1, '2026-12-10', 200, 0, 200, 'pendente', v_l2) returning id into v_parc2;
  update public.financeiro_lancamentos_v2 set valor = 250 where id = v_l2;
  select * into r from public.financiamento_parcelas where id = v_parc2;
  if r.valor_principal is distinct from 200.00 or r.valor_total is distinct from 200.00 then raise exception 'S4: parcelamento mudou %', r; end if;

  /* S5 — cancelado: a função dona não toca */
  update public.financeiro_lancamentos_v2 set cancelado = true where id = v_lj;
  perform public._fn_parcela_acompanha_lancamento(v_lj);
  select * into r from public.financiamento_parcelas where id = v_parc;
  if r.valor_juros is distinct from 80.00 then raise exception 'S5: cancelado mexeu %', r; end if;
  /* guarda de cliente: um lançamento de OUTRO cliente apontado pela parcela não a muda */
  update public.financiamento_parcelas set lancamento_juros_id = (select id from public.financeiro_lancamentos_v2 where cliente_id <> c_teste and not cancelado limit 1) where id = v_parc;
  perform public._fn_parcela_acompanha_lancamento((select lancamento_juros_id from public.financiamento_parcelas where id = v_parc));
  select * into r from public.financiamento_parcelas where id = v_parc;
  if r.valor_juros is distinct from 80.00 then raise exception 'S5: outro cliente mexeu %', r; end if;

  /* S6 */
  select valor_juros, valor_total into r from public.financiamento_parcelas where id = '49368ecf-debb-498c-afbd-3612756167ec';
  if r.valor_juros is distinct from 128579.30 or r.valor_total is distinct from 357916.03 then raise exception 'S6: parcela 3 %', r; end if;

  raise exception 'FIN-CONTRATO-JUROS-SYNC-01: OK';
end
$teste$;
ROLLBACK;
