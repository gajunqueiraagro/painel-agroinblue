-- FIN-FINANC-28 · PASSO 6 — VINCULAR UM LANCAMENTO A FINANCIAMENTO, A PARTIR DO MODAL DO FINANCEIRO (Gabriel, 17/10/2026).
--
-- "O mesmo motor do 4b ao contrario": NENHUMA regra nova de candidatura. A leitura abaixo pergunta a `fn_financiamento_candidatas`
-- (passo 4b) — contrato a contrato, parcela a parcela — se ESTE lancamento e' candidato, so' nas parcelas / contratos cuja janela
-- o alcanca (parcela a ±45 dias do vencimento; contrato de 30 dias antes a 365 depois). Pontos, motivos, papel sugerido e "onde ja'
-- esta'" sao os de la'. Encargo: o par `fn_contrato_encargo_candidatas` / `fn_contrato_encargo_vincular` que ja' existe (a tela
-- chama direto). Os gestos sao os do 4b e do passo 4 (vincular pagamento, salvar liberacao), com o contrario de cada um.
--
-- `fn_lancamento_financiamento(lancamento)` -> {lancamento, atual (onde ele ja' esta': parcela / liberacao / encargo / captacao, com o
-- contrato), parcelas [candidatas], liberacoes [candidatas]}. SECURITY DEFINER, guarda pelo cliente do LANCAMENTO
-- (`_fn_exigir_tenant_das_linhas`, 42501), STABLE. Nenhum dado tocado.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

create or replace function public.fn_lancamento_financiamento(p_lancamento_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public set plan_cache_mode = force_custom_plan
as $$
declare
  l public.financeiro_lancamentos_v2%rowtype;
  v_dt date; v_atual jsonb; v_parc jsonb := '[]'::jsonb; v_lib jsonb := '[]'::jsonb; r jsonb; e jsonb; x record;
begin
  perform public._fn_exigir_tenant_das_linhas(array[(select cliente_id from public.financeiro_lancamentos_v2 where id = p_lancamento_id)]);
  select * into l from public.financeiro_lancamentos_v2 where id = p_lancamento_id;
  v_dt := coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia);

  -- onde o lancamento ja' esta' (a primeira que achar, na ordem: parcela, liberacao, encargo, captacao)
  select jsonb_build_object('tipo', 'parcela', 'financiamento_id', f.id, 'numero_contrato', f.numero_contrato, 'descricao', f.descricao,
           'parcela', q.numero_parcela, 'papel', case when q.lancamento_juros_id = l.id then 'juros' else 'principal' end,
           'vinculo_id', (select v.id from public.financiamento_parcela_vinculos v where v.lancamento_id = l.id and v.desfeito_em is null))
    into v_atual
    from public.financiamento_parcelas q join public.financiamentos f on f.id = q.financiamento_id
   where (q.lancamento_id = l.id or q.lancamento_juros_id = l.id) and coalesce(q.status, '') <> 'cancelado' limit 1;
  if v_atual is null then
    select jsonb_build_object('tipo', 'liberacao', 'financiamento_id', f.id, 'numero_contrato', f.numero_contrato, 'descricao', f.descricao, 'liberacao_id', o.id)
      into v_atual from public.financiamento_liberacoes o join public.financiamentos f on f.id = o.financiamento_id
     where o.lancamento_id = l.id and o.cancelado_em is null limit 1;
  end if;
  if v_atual is null then
    select jsonb_build_object('tipo', 'encargo', 'financiamento_id', f.id, 'numero_contrato', f.numero_contrato, 'descricao', f.descricao, 'encargo_id', e2.id, 'papel', e2.papel)
      into v_atual from public.financiamento_encargos e2 join public.financiamentos f on f.id = e2.financiamento_id
     where e2.lancamento_id = l.id and e2.desfeito_em is null limit 1;
  end if;
  if v_atual is null then
    select jsonb_build_object('tipo', 'captacao', 'financiamento_id', f.id, 'numero_contrato', f.numero_contrato, 'descricao', f.descricao)
      into v_atual from public.financiamentos f where f.lancamento_captacao_id = l.id limit 1;
  end if;

  if not coalesce(l.cancelado, false) and v_dt is not null then
    if coalesce(l.tipo_operacao, '') like '2-%' then
      for x in select q.id as parcela_id, q.numero_parcela, q.data_vencimento, f.id as fin_id, f.numero_contrato, f.descricao,
                      (select fo.nome from public.financeiro_fornecedores fo where fo.id = f.credor_id) as credor
                 from public.financiamento_parcelas q join public.financiamentos f on f.id = q.financiamento_id
                where f.cliente_id = l.cliente_id and f.natureza <> 'parcelamento' and f.status in ('ativo', 'prorrogado')
                  and coalesce(q.status, '') <> 'cancelado' and q.data_vencimento between v_dt - 45 and v_dt + 45
                  and not public._fn_parcela_esta_paga(q.id)
                order by abs(q.data_vencimento - v_dt), q.id loop
        r := public.fn_financiamento_candidatas(x.fin_id, 'parcela', x.parcela_id);
        select el into e from jsonb_array_elements(r->'linhas') el where el->>'lancamento_id' = l.id::text;
        if e is not null then
          v_parc := v_parc || (e || jsonb_build_object('financiamento_id', x.fin_id, 'numero_contrato', x.numero_contrato, 'descricao_contrato', x.descricao,
            'credor', x.credor, 'parcela_id', x.parcela_id, 'parcela', x.numero_parcela, 'vencimento', x.data_vencimento));
        end if;
        e := null;
      end loop;
    elsif coalesce(l.tipo_operacao, '') like '1-%' then
      for x in select f.id as fin_id, f.numero_contrato, f.descricao, (select fo.nome from public.financeiro_fornecedores fo where fo.id = f.credor_id) as credor
                 from public.financiamentos f
                where f.cliente_id = l.cliente_id and f.natureza <> 'parcelamento' and f.status in ('ativo', 'prorrogado')
                  and v_dt between coalesce(f.data_contrato, f.data_inicio, v_dt) - 365 and coalesce(f.data_contrato, f.data_inicio, v_dt) + 30
                order by f.data_contrato desc nulls last, f.id loop
        r := public.fn_financiamento_candidatas(x.fin_id, 'liberacao', null);
        select el into e from jsonb_array_elements(r->'linhas') el where el->>'lancamento_id' = l.id::text;
        if e is not null then
          v_lib := v_lib || (e || jsonb_build_object('financiamento_id', x.fin_id, 'numero_contrato', x.numero_contrato, 'descricao_contrato', x.descricao,
            'credor', x.credor, 'saldo_a_liberar', r->'saldo_a_liberar'));
        end if;
        e := null;
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'lancamento', jsonb_build_object('id', l.id, 'tipo_operacao', l.tipo_operacao, 'data', v_dt, 'valor', round(abs(l.valor), 2),
      'descricao', l.descricao, 'cancelado', coalesce(l.cancelado, false)),
    'atual', v_atual,
    'parcelas', (select coalesce(jsonb_agg(p order by (p->>'pontos')::numeric desc, p->>'vencimento'), '[]'::jsonb) from jsonb_array_elements(v_parc) p),
    'liberacoes', (select coalesce(jsonb_agg(p order by (p->>'pontos')::numeric desc), '[]'::jsonb) from jsonb_array_elements(v_lib) p));
end $$;

do $$
begin
  revoke all on function public.fn_lancamento_financiamento(uuid) from public, anon;
  grant execute on function public.fn_lancamento_financiamento(uuid) to authenticated, service_role;
  if has_function_privilege('anon', 'public.fn_lancamento_financiamento(uuid)'::regprocedure, 'EXECUTE') then raise exception 'anon executa'; end if;
end $$;
