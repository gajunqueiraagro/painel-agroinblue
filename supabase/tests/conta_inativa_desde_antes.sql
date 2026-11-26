-- CONTA-INATIVAR-DATA-01 — teste do lote 118850. Roda como postgres, numa transação que termina em RAISE 'ENSAIO OK…' (nada fica).
-- ANTES (rodar antes da migration): a regra não existe e a coluna não existe; guarda a FOTO do NJ (nov/2022, "Todas as contas", as 4 ativas)
-- para o igual→igual do DEPOIS (com a cc 03 inativa desde 01/02/2026, nov/2022 tem de sair IGUAL).
-- DEPOIS: T1 a regra (ativa = como hoje) · T2 as recusas do inativar (sem data, dia ≠ 1, saldo, lançamento, extrato) · T3 inativa OK com a
-- trilha · T4 a regra na inativa (saldo/lançamento/extrato/antes da data aparecem; depois some) · T5 o gatilho (lançamento novo ≥ data
-- recusado, antes passa, trocar para a conta recusado; como `authenticated`) · T6 reativar limpa a data · T7 a prévia · T8 o NJ igual→igual
-- (resumo, status do ano e Visão geral de nov/2022) com a 03 inativa · T9 os 7 leitores leem a regra.
-- ═══ ANTES ═══
do $antes$ begin
  if to_regprocedure('public._fn_conta_no_mes(uuid, text)') is not null then raise exception 'ANTES: a regra já existe'; end if;
  if exists (select 1 from information_schema.columns where table_name = 'financeiro_contas_bancarias' and column_name = 'inativa_desde') then
    raise exception 'ANTES: a coluna já existe'; end if;
end $antes$;
set local statement_timeout = '120s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
create temp table _ens_antes on commit drop as
  select 'resumo' k, count(*)::text n, round(sum(r.saldo_sistema), 2)::text s, string_agg(r.conta_id::text, ',' order by r.conta_id) ids
    from public._fn_conciliacao_resumo('f2d67cd4-24d0-456f-a079-a3281dcce7fd', '2022-11', null, false, false) r
  union all
  select 'status', count(*)::text, null, string_agg(r.conta_id::text || ':' || r.status, ',' order by r.conta_id)
    from public.fn_conciliacao_status_ano('f2d67cd4-24d0-456f-a079-a3281dcce7fd', 2022) r where r.ano_mes = '2022-11'
  union all
  select 'vg', count(*)::text, round(sum(v.saldo_final), 2)::text, null
    from public.fn_vg_saldos('f2d67cd4-24d0-456f-a079-a3281dcce7fd', '2022-11-01', '2022-11-30') v;
