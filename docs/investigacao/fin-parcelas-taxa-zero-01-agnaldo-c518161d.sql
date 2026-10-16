-- FIN-PARCELAS-TAXA-ZERO-01 — regeração das 80 parcelas do consórcio c518161d (cliente a2d41cda), PROPOSTA.
-- NÃO APLICADO. EXIGE a migration 20261027199600 (FIN-AMORT-COMPETENCIA-VENC-01) aplicada. Roda em ENSAIO (c_aplicar = false): faz tudo, mostra antes x depois no erro final e desfaz (o RAISE reverte).
-- Para aplicar, SÓ COM O GO DO GABRIEL: trocar c_aplicar para true (o bloco termina sem erro e a transação do canal grava).
--
-- O que faz, nesta ordem:
--   0. guardas: o contrato no estado medido em 16/10/2026 (financiamento, taxa 0, 80 parcelas vivas, total 224.292,80);
--      RECUSA se alguma parcela está paga ou se algum lançamento do contrato está realizado, conciliado ou com vínculo vivo
--      de extrato.
--   1. as parcelas: vencimento = 18/07/2026 + (n − 1) meses e valor_total = principal + juros (o que o cadastro deveria ter
--      gravado). Só essas duas colunas.
--   2. os lançamentos: pelo MESMO escritor do lápis da parcela e do cadastro corrigido — `fn_reconciliar_financiamento`
--      (laço de `fn_reconciliar_parcela_financiamento`). A parcela 1 já tem lançamento (3db22677, previsto, venc. 18/06):
--      o motor o MANTÉM e acerta o vencimento para 18/07 e o status para programado; as 79 restantes ganham o seu.
--   3. confere o depois e devolve o relatório.
-- Gesto contrário (se aplicado): cancelar pelo dono (`fn_cancelar_lancamento_auditoria`) os 79 lançamentos criados e voltar
-- as parcelas ao vencimento e valor_total anteriores (o relatório guarda os dois).
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
DO $agn$
declare
  c_aplicar  constant boolean := false;
  c_fin      constant uuid := (select id from public.financiamentos where id::text like 'c518161d%');
  c_cli      constant text := 'a2d41cda';
  c_primeira constant date := date '2026-07-18';
  r record;
  v_antes jsonb;
  v_depois jsonb;
  v_motor jsonb;
  n int;
begin
  -- 0. guardas
  select * into r from public.financiamentos where id = c_fin;
  if not found or r.cliente_id::text not like c_cli || '%' or r.natureza <> 'financiamento' or r.status <> 'ativo'
     or coalesce(r.taxa_juros_mensal, 0) <> 0 or r.total_parcelas <> 80 or r.valor_total <> 224292.80 then
    raise exception 'Contrato fora do estado medido: %', to_jsonb(r) - 'observacao';
  end if;
  select count(*) into n from public.financiamento_parcelas where financiamento_id = c_fin and coalesce(status, '') <> 'cancelado';
  if n <> 80 then raise exception 'Esperava 80 parcelas vivas, achei %', n; end if;
  if exists (select 1 from public.financiamento_parcelas where financiamento_id = c_fin and status = 'pago') then
    raise exception 'Há parcela paga: nada foi alterado.';
  end if;
  if exists (select 1 from public.financeiro_lancamentos_v2 l
              where l.financiamento_id = c_fin and not coalesce(l.cancelado, false)
                and (l.status_transacao in ('realizado', 'conciliado') or l.data_pagamento is not null
                     or exists (select 1 from public.conciliacao_bancaria_itens ci where ci.lancamento_id = l.id and ci.desfeito_em is null))) then
    raise exception 'Há lançamento do contrato realizado, conciliado ou casado com o extrato: nada foi alterado.';
  end if;

  select jsonb_build_object(
      'parcelas', count(*),
      'soma_principal', sum(valor_principal), 'soma_juros', sum(valor_juros), 'soma_valor_total', sum(valor_total),
      'com_valor_total_zero', count(*) filter (where coalesce(valor_total, 0) = 0),
      'primeira', min(data_vencimento), 'ultima', max(data_vencimento),
      'com_lancamento', count(*) filter (where lancamento_id is not null),
      'vencimentos', jsonb_agg(jsonb_build_object('n', numero_parcela, 'venc', data_vencimento, 'vt', valor_total) order by numero_parcela)
    ) into v_antes
    from public.financiamento_parcelas where financiamento_id = c_fin and coalesce(status, '') <> 'cancelado';
  v_antes := v_antes || jsonb_build_object('lancamentos_vivos',
    (select count(*) from public.financeiro_lancamentos_v2 where financiamento_id = c_fin and not coalesce(cancelado, false)));

  -- 1. as parcelas
  update public.financiamento_parcelas
     set data_vencimento = (c_primeira + make_interval(months => numero_parcela - 1))::date,
         valor_total = coalesce(valor_principal, 0) + coalesce(valor_juros, 0),
         updated_at = now()
   where financiamento_id = c_fin and coalesce(status, '') <> 'cancelado';

  -- 2. os lançamentos, pelo escritor de sempre
  v_motor := public.fn_reconciliar_financiamento(c_fin, false, true);

  -- 2b. FIN-AMORT-COMPETENCIA-VENC-01: com o motor novo as 79 amortizações criadas já nascem com a competência no vencimento;
  --     o lançamento da parcela 1, que JÁ existia (3db22677), o motor não toca na competência — ela vai ao vencimento aqui,
  --     pela regra do backfill (só o que não está realizado nem conciliado).
  update public.financeiro_lancamentos_v2 l
     set data_competencia = q.data_vencimento, updated_at = now()
    from public.financiamento_parcelas q
   where q.financiamento_id = c_fin and l.id = q.lancamento_id and not coalesce(l.cancelado, false)
     and l.data_competencia is distinct from q.data_vencimento
     and l.status_transacao not in ('realizado', 'conciliado')
     and not exists (select 1 from public.conciliacao_bancaria_itens ci where ci.lancamento_id = l.id and ci.desfeito_em is null);

  -- 3. o depois
  select jsonb_build_object(
      'parcelas', count(*),
      'soma_principal', sum(q.valor_principal), 'soma_valor_total', sum(q.valor_total),
      'com_valor_total_zero', count(*) filter (where coalesce(q.valor_total, 0) = 0),
      'primeira', min(q.data_vencimento), 'ultima', max(q.data_vencimento),
      'meses_distintos', count(distinct to_char(q.data_vencimento, 'YYYY-MM')),
      'com_lancamento_vivo', count(*) filter (where l.id is not null),
      'lanc_venc_igual_parcela', count(*) filter (where l.data_vencimento = q.data_vencimento),
      'lanc_valor_igual_parcela', count(*) filter (where round(abs(l.valor), 2) = round(q.valor_total, 2)),
      'lanc_ano_mes_do_vencimento', count(*) filter (where l.ano_mes = to_char(q.data_vencimento, 'YYYY-MM')
                                                       and l.data_competencia = q.data_vencimento),
      'lanc_ano_mes_distintos', count(distinct l.ano_mes),
      'lanc_ano_mes_de', min(l.ano_mes), 'lanc_ano_mes_ate', max(l.ano_mes),
      'status_dos_lancamentos', (select jsonb_object_agg(s, c) from (
          select l2.status_transacao s, count(*) c from public.financiamento_parcelas q2
            join public.financeiro_lancamentos_v2 l2 on l2.id = q2.lancamento_id and not coalesce(l2.cancelado, false)
           where q2.financiamento_id = c_fin and coalesce(q2.status, '') <> 'cancelado' group by 1) x),
      'ano_mes_dos_lancamentos', (select jsonb_object_agg(cp, c) from (
          select l3.ano_mes cp, count(*) c from public.financiamento_parcelas q3
            join public.financeiro_lancamentos_v2 l3 on l3.id = q3.lancamento_id and not coalesce(l3.cancelado, false)
           where q3.financiamento_id = c_fin and coalesce(q3.status, '') <> 'cancelado' group by 1) y)
    ) into v_depois
    from public.financiamento_parcelas q
    left join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_id and not coalesce(l.cancelado, false)
   where q.financiamento_id = c_fin and coalesce(q.status, '') <> 'cancelado';
  v_depois := v_depois || jsonb_build_object(
    'lancamentos_vivos', (select count(*) from public.financeiro_lancamentos_v2 where financiamento_id = c_fin and not coalesce(cancelado, false)),
    'motor', v_motor->'resumo');

  if (v_depois->>'parcelas')::int is distinct from 80
     or (v_depois->>'soma_valor_total')::numeric is distinct from 224292.80
     or (v_depois->>'com_valor_total_zero')::int is distinct from 0
     or (v_depois->>'primeira')::date is distinct from c_primeira
     or (v_depois->>'ultima')::date is distinct from (c_primeira + interval '79 months')::date
     or (v_depois->>'meses_distintos')::int is distinct from 80
     or (v_depois->>'com_lancamento_vivo')::int is distinct from 80
     or (v_depois->>'lanc_venc_igual_parcela')::int is distinct from 80
     or (v_depois->>'lanc_valor_igual_parcela')::int is distinct from 80
     or (v_depois->>'lanc_ano_mes_do_vencimento')::int is distinct from 80
     or (v_depois->>'lanc_ano_mes_distintos')::int is distinct from 80
     or (v_depois->>'lancamentos_vivos')::int is distinct from 80 then
    raise exception 'Depois fora do esperado (nada gravado): %', v_depois;
  end if;

  if not c_aplicar then
    raise exception 'ENSAIO (revertido): %', jsonb_build_object('antes', v_antes - 'vencimentos', 'depois', v_depois);
  end if;
  raise notice 'APLICADO: %', jsonb_build_object('antes', v_antes, 'depois', v_depois);
end
$agn$;
