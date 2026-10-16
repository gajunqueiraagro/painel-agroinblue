-- FIN-AMORT-COMPETENCIA-VENC-01 — acerto das amortizacoes antigas, PROPOSTA. NAO APLICADO.
-- Roda em ENSAIO (c_aplicar = false): faz tudo, devolve antes x depois por cliente no erro final e desfaz.
-- Para aplicar, SO' COM O GO DO GABRIEL: c_aplicar = true, e a transacao do canal grava.
--
-- ALVO (o item 2 da FASE 0, medido em 16/10/2026): lancamento VIVO de amortizacao de financiamento
-- (origem_lancamento 'parcela_financiamento', origem_tipo 'parcela_principal') cujo ano_mes e' NULO ou diferente do mes do
-- vencimento. Gesto: data_competencia = data_vencimento (o ano_mes acompanha pelo gatilho, a partir da competencia).
-- Nada mais muda: valor, datas de vencimento e pagamento, status, conta, classificacao, vinculos.
-- FICAM DE FORA, so' listados: o conciliado (vinculo vivo de extrato) e o de mes fechado em `financeiro_fechamentos`
-- (o mes de hoje OU o de destino). Fora do alvo, e NAO tocadas: as amortizacoes com ano_mes ja' no mes do vencimento e
-- competencia antiga (a FASE 0 conta quantas).
-- Gesto contrario: o relatorio guarda, por lancamento, a competencia e o ano_mes de antes.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';
DO $bf$
declare
  c_aplicar constant boolean := false;
  v_alvo jsonb; v_fora jsonb; v_antes jsonb; v_depois jsonb; n_upd int; n_ok int; n_alvo int;
begin
  create temp table _amort_alvo on commit drop as
  select l.id, l.cliente_id, l.fazenda_id, l.ano_mes as ano_mes_antes, l.data_competencia as competencia_antes,
         l.data_vencimento, to_char(l.data_vencimento, 'YYYY-MM') as ano_mes_destino, l.status_transacao,
         exists (select 1 from public.conciliacao_bancaria_itens ci where ci.lancamento_id = l.id and ci.desfeito_em is null) as conciliado,
         exists (select 1 from public.financeiro_fechamentos ff
                  where ff.cliente_id = l.cliente_id and ff.fazenda_id = l.fazenda_id and ff.status_fechamento = 'fechado'
                    and ff.ano_mes in (l.ano_mes, to_char(l.data_vencimento, 'YYYY-MM'))) as mes_fechado
    from public.financeiro_lancamentos_v2 l
   where l.origem_lancamento = 'parcela_financiamento' and l.origem_tipo = 'parcela_principal'
     and not coalesce(l.cancelado, false) and l.data_vencimento is not null
     and (l.ano_mes is null or l.ano_mes <> to_char(l.data_vencimento, 'YYYY-MM'));

  select count(*) into n_alvo from _amort_alvo where not conciliado and not mes_fechado;

  select coalesce(jsonb_object_agg(cli, x), '{}') into v_antes from (
    select left(cliente_id::text, 8) cli, jsonb_build_object(
             'no_item_2', count(*),
             'sem_ano_mes', count(*) filter (where ano_mes_antes is null),
             'ano_mes_diferente', count(*) filter (where ano_mes_antes is not null),
             'realizadas', count(*) filter (where status_transacao in ('realizado', 'conciliado')),
             'conciliadas_fora', count(*) filter (where conciliado),
             'mes_fechado_fora', count(*) filter (where mes_fechado),
             'a_acertar', count(*) filter (where not conciliado and not mes_fechado)) x
      from _amort_alvo group by 1) s;

  select coalesce(jsonb_agg(jsonb_build_object('lancamento', left(id::text, 8), 'cliente', left(cliente_id::text, 8),
           'ano_mes', ano_mes_antes, 'venc', data_vencimento, 'motivo', case when conciliado then 'conciliado' else 'mes fechado' end)
           order by cliente_id, data_vencimento), '[]') into v_fora
    from _amort_alvo where conciliado or mes_fechado;

  update public.financeiro_lancamentos_v2 l
     set data_competencia = a.data_vencimento, updated_at = now()
    from _amort_alvo a
   where l.id = a.id and not a.conciliado and not a.mes_fechado;
  get diagnostics n_upd = row_count;

  select count(*) into n_ok from public.financeiro_lancamentos_v2 l join _amort_alvo a on a.id = l.id
   where not a.conciliado and not a.mes_fechado
     and l.data_competencia = a.data_vencimento and l.ano_mes = a.ano_mes_destino;
  if n_upd is distinct from n_alvo or n_ok is distinct from n_alvo then
    raise exception 'Depois fora do esperado (nada gravado): alvo %, atualizados %, no mes do vencimento %', n_alvo, n_upd, n_ok;
  end if;

  select coalesce(jsonb_object_agg(cli, x), '{}') into v_depois from (
    select left(a.cliente_id::text, 8) cli, jsonb_build_object(
             'acertadas', count(*) filter (where l.ano_mes = a.ano_mes_destino and l.data_competencia = a.data_vencimento),
             'ainda_fora', count(*) filter (where l.ano_mes is distinct from a.ano_mes_destino)) x
      from _amort_alvo a join public.financeiro_lancamentos_v2 l on l.id = a.id group by 1) s;

  if not c_aplicar then
    raise exception 'ENSAIO (revertido): %', jsonb_build_object('antes', v_antes, 'depois', v_depois, 'fora', v_fora);
  end if;
  raise notice 'APLICADO: %', jsonb_build_object('antes', v_antes, 'depois', v_depois, 'fora', v_fora,
    'gesto_contrario', (select jsonb_agg(jsonb_build_object('id', id, 'competencia', competencia_antes, 'ano_mes', ano_mes_antes))
                          from _amort_alvo where not conciliado and not mes_fechado));
end
$bf$;
