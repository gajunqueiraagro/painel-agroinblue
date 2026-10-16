-- FIN-AMORT-COMPETENCIA-VENC-01 — a amortizacao nasce no mes do vencimento. Termina em RAISE 'OK'; transacao revertida, sem sobra.
-- Sintetico no cliente Teste (contrato de 2031, 12 parcelas mensais). Compara com `is distinct from`.
--   A1 o motor cria 12 amortizacoes com data_competencia = vencimento e ano_mes = mes de cada vencimento (12 meses distintos)
--   A2 o juros segue igual: data_competencia = vencimento
--   A3 regerar (o motor de novo, contrato e parcela a parcela) nao muda nada: 0 acoes, lancamentos identicos por md5
--   A4 o lancamento SUBSTITUIDO pelo motor (o vivo da parcela cancelado) tambem nasce no vencimento
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  fin uuid; v jsonb; antes text; depois text; n int; p1 uuid; l1 uuid;
begin
  insert into public.financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato,
                                     valor_total, valor_entrada, data_contrato, data_primeira_parcela, total_parcelas, status)
  values (k, f, 'financiamento', 'pecuaria', 'SINT AMORT VENC', 'SINT-001', 12000, 0, date '2031-01-10', date '2031-02-15', 12, 'ativo')
  returning id into fin;
  insert into public.financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento,
                                             valor_principal, valor_juros, valor_total, status)
  select fin, k, g, (date '2031-02-15' + make_interval(months => g - 1))::date, 1000, 50, 1050, 'pendente'
    from generate_series(1, 12) g;

  /* A1 */
  v := public.fn_reconciliar_financiamento(fin, false, true);
  select count(*) into n from public.financiamento_parcelas q
    join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_id and not l.cancelado
   where q.financiamento_id = fin
     and l.data_competencia = q.data_vencimento and l.ano_mes = to_char(q.data_vencimento, 'YYYY-MM');
  if n is distinct from 12 then raise exception 'A1 amortizacoes no vencimento: % de 12', n; end if;
  select count(distinct l.ano_mes) into n from public.financiamento_parcelas q
    join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.financiamento_id = fin;
  if n is distinct from 12 then raise exception 'A1 meses distintos: %', n; end if;

  /* A2 */
  select count(*) into n from public.financiamento_parcelas q
    join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_juros_id and not l.cancelado
   where q.financiamento_id = fin and l.data_competencia = q.data_vencimento;
  if n is distinct from 12 then raise exception 'A2 juros no vencimento: % de 12', n; end if;

  /* A3 */
  select string_agg(md5((to_jsonb(l) - 'updated_at' - 'updated_by')::text), ',' order by l.id) into antes
    from public.financeiro_lancamentos_v2 l where l.financiamento_id = fin;
  v := public.fn_reconciliar_financiamento(fin, false, true);
  if (v->'resumo'->>'total_acoes')::int is distinct from 0 then raise exception 'A3 regerar teve acoes: %', v->'resumo'; end if;
  select id into p1 from public.financiamento_parcelas where financiamento_id = fin and numero_parcela = 1;
  v := public.fn_reconciliar_parcela_financiamento(p1, false, true);
  if (v->'resumo'->>'qtd_acoes')::int is distinct from 0 then raise exception 'A3 regerar a parcela teve acoes: %', v->'resumo'; end if;
  select string_agg(md5((to_jsonb(l) - 'updated_at' - 'updated_by')::text), ',' order by l.id) into depois
    from public.financeiro_lancamentos_v2 l where l.financiamento_id = fin;
  if antes is distinct from depois then raise exception 'A3 lancamentos mudaram ao regerar'; end if;

  /* A4 */
  select lancamento_id into l1 from public.financiamento_parcelas where id = p1;
  update public.financeiro_lancamentos_v2 set cancelado = true, cancelado_em = now(), cancelado_motivo = 'SINT A4' where id = l1;
  v := public.fn_reconciliar_parcela_financiamento(p1, false, true);
  if not exists (select 1 from public.financiamento_parcelas q
                   join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_id and not l.cancelado
                  where q.id = p1 and l.id <> l1 and l.data_competencia = date '2031-02-15' and l.ano_mes = '2031-02') then
    raise exception 'A4 o recriado nao nasceu no vencimento';
  end if;

  raise exception 'FIN-AMORT-COMPETENCIA-VENC-01: OK';
end
$teste$;
ROLLBACK;
