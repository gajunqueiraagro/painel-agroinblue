-- FIN-CONTRATO-VINCULAR-ENCARGO-01 passo 2 (Gabriel, 11/10/2026): A SITUACAO DO CONTRATO ENXERGA OS ENCARGOS, E A LISTA TEM
-- UMA LEITURA POR CLIENTE. So' leitura; nenhum dado e' alterado; nenhuma coluna nova.
-- (1) PATCH GUARDADO POR md5 de fn_financiamento_situacao (origem 70a7d04bec7bb5db2319e5ebbaba6e2c, o corpo do PARC-CADEIA-01
--     passo 4): SO' com p_detalhe o retorno ganha a chave `encargos` e os cartoes ganham, no fim, encargos_qtde, encargos_pagos,
--     encargos_a_pagar, encargos_orfaos, juros_pagos e custo_total. SEM p_detalhe o retorno e' o de antes, byte a byte
--     (v_enc fica nulo e nada e' concatenado): o lote, a lista e os paineis nao mudam nem pagam por isto.
--     · encargo = linha VIVA de financiamento_encargos cujo lancamento esta' vivo; o vivo de lancamento CANCELADO nao entra na
--       lista nem nas somas e e' contado em encargos_orfaos (nao ha' gatilho lancamento -> encargo: e' informacao);
--     · "pago" e' a regra de sempre da situacao: status realizado ou conciliado. Nenhuma segunda regra;
--     · juros_pagos = os juros ja' pagos das parcelas, pela MESMA regra do valor_pago da parcela (fonte lancamento: o lancamento
--       de juros realizado/conciliado, pelo valor dele; fonte parcela: os juros da parcela 'pago'); 0 no parcelamento;
--     · custo_total = encargos_pagos + juros_pagos. Somas no cru, arredondadas na saida.
-- (2) fn_encargos_dos_lancamentos(cliente): {lancamento_id: {financiamento_id, papel, contrato}} — so' vinculo vivo de contrato
--     vivo. O leitor da marca na lista de Lancamentos e na CPR (molde de fn_parcelas_dos_lancamentos).
SET LOCAL lock_timeout = '2s';

DO $patch$
declare
  c_origem  constant text := '70a7d04bec7bb5db2319e5ebbaba6e2c';
  c_destino constant text := '4eb6abf080fa8d17d7c03b2577a169eb';
  v_oid  oid := 'public.fn_financiamento_situacao(uuid, date, boolean)'::regprocedure;
  v_src  text;
  v_new  text;
  a1 constant text := $a$  v_cart  jsonb;
begin$a$;
  n1 constant text := $a$  v_cart  jsonb;
  v_enc   jsonb;
  v_ecart jsonb;
  v_ep    numeric;
  v_jp    numeric;
begin$a$;
  a2 constant text := $a$      from notas n);
  end if;

  return jsonb_build_object('financiamento_id', f.id, 'natureza', f.natureza, 'hoje', v_hoje, 'parcelas', v_parc, 'cartoes', v_cart);$a$;
  n2 constant text := $a$      from notas n);

    -- FIN-CONTRATO-VINCULAR-ENCARGO-01 passo 2: os ENCARGOS do contrato (juros, IOF, tarifa... ligados em financiamento_encargos).
    -- So' aqui, no detalhe. Vivo de lancamento cancelado = orfao: fora da lista e das somas, contado a' parte.
    with enc as (
      select x.id as encargo_id, x.papel, x.vinculado_em, l.id as lancamento_id, coalesce(l.cancelado, false) as morto,
             l.descricao, abs(coalesce(l.valor, 0)) as valor, l.status_transacao, l.subcentro,
             coalesce(l.status_transacao, '') in ('realizado', 'conciliado') as paga,
             coalesce(case when l.status_transacao in ('realizado', 'conciliado') then l.data_pagamento end,
                      l.data_vencimento, l.data_competencia) as dt,
             c.id as conta_id, coalesce(nullif(c.nome_exibicao, ''), c.nome_conta) as conta_nome,
             exists (select 1 from public.conciliacao_bancaria_itens ci
                      where ci.lancamento_id = l.id and ci.desfeito_em is null) as conciliado
        from public.financiamento_encargos x
        join public.financeiro_lancamentos_v2 l on l.id = x.lancamento_id
        left join public.financeiro_contas_bancarias c
               on c.id = public._fn_conta_do_lancamento(l.tipo_operacao, l.conta_bancaria_id, l.conta_destino_id)
       where x.financiamento_id = f.id and x.desfeito_em is null
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'encargo_id', e.encargo_id, 'lancamento_id', e.lancamento_id, 'papel', e.papel, 'data', e.dt,
             'descricao', e.descricao, 'valor', round(e.valor, 2), 'status_transacao', e.status_transacao,
             'paga', e.paga, 'conciliado', e.conciliado, 'conta_id', e.conta_id, 'conta_nome', e.conta_nome,
             'subcentro', e.subcentro, 'vinculado_em', e.vinculado_em)
             order by e.dt desc nulls last, e.vinculado_em desc, e.encargo_id) filter (where not e.morto), '[]'::jsonb),
           jsonb_build_object(
             'encargos_qtde', count(*) filter (where not e.morto),
             'encargos_pagos', round(coalesce(sum(e.valor) filter (where not e.morto and e.paga), 0), 2),
             'encargos_a_pagar', round(coalesce(sum(e.valor) filter (where not e.morto and not e.paga), 0), 2),
             'encargos_orfaos', count(*) filter (where e.morto)),
           coalesce(sum(e.valor) filter (where not e.morto and e.paga), 0)
      into v_enc, v_ecart, v_ep
      from enc e;

    -- os juros ja' pagos das parcelas, pela mesma regra do valor_pago de cada parcela (acima)
    select coalesce(sum(case
             when e.p->>'fonte' = 'parcela' then case when e.p->>'situacao' = 'paga' then coalesce(q.valor_juros, 0) else 0 end
             when lj.status_transacao in ('realizado', 'conciliado') then abs(coalesce(lj.valor, 0))
             else 0 end), 0)
      into v_jp
      from jsonb_array_elements(v_parc) e(p)
      left join public.financiamento_parcelas q on q.id = (e.p->>'id')::uuid
      left join public.financeiro_lancamentos_v2 lj on lj.id = (e.p->>'lancamento_juros_id')::uuid;

    v_cart := v_cart || v_ecart || jsonb_build_object('juros_pagos', round(v_jp, 2), 'custo_total', round(v_ep + v_jp, 2));
  end if;

  return jsonb_build_object('financiamento_id', f.id, 'natureza', f.natureza, 'hoje', v_hoje, 'parcelas', v_parc, 'cartoes', v_cart)
         || case when v_enc is not null then jsonb_build_object('encargos', v_enc) else '{}'::jsonb end;$a$;
begin
  select prosrc into v_src from pg_proc where oid = v_oid;
  if md5(v_src) is distinct from c_origem then
    raise exception 'fn_financiamento_situacao: origem % (esperado %)', md5(v_src), c_origem;
  end if;
  -- ancoras: cada uma casa 1x; e o CONCEITO tambem (uma declaracao de v_cart, um RETURN, um fecho do bloco de detalhe)
  if (length(v_src) - length(replace(v_src, a1, ''))) / length(a1) <> 1
     or (length(v_src) - length(replace(v_src, a2, ''))) / length(a2) <> 1
     or (select count(*) from regexp_matches(v_src, 'v_cart\s+jsonb;', 'g')) <> 1
     or (select count(*) from regexp_matches(v_src, '\mreturn\M', 'g')) <> 1
     or (select count(*) from regexp_matches(v_src, 'coalesce\(p_detalhe, false\)', 'g')) <> 1
     or (select count(*) from regexp_matches(v_src, 'from notas n\);', 'g')) <> 1 then
    raise exception 'fn_financiamento_situacao: ancora nao casa exatamente 1x';
  end if;
  v_new := replace(replace(v_src, a1, n1), a2, n2);
  if md5(v_new) is distinct from c_destino then
    raise exception 'fn_financiamento_situacao: destino % (esperado %)', md5(v_new), c_destino;
  end if;
  if position(v_src in pg_get_functiondef(v_oid)) = 0 then raise exception 'corpo nao achado na definicao'; end if;
  execute replace(pg_get_functiondef(v_oid), v_src, v_new);
  if (select md5(prosrc) from pg_proc where oid = v_oid) is distinct from c_destino then
    raise exception 'fn_financiamento_situacao: gravado diferente do destino';
  end if;
end
$patch$;

COMMENT ON FUNCTION public.fn_financiamento_situacao(uuid, date, boolean) IS
  'Situacao do contrato (parcelas e cartoes). So'' com p_detalhe: o detalhe das parcelas, `encargos` (vinculos vivos de financiamento_encargos com lancamento vivo; o de lancamento cancelado conta em encargos_orfaos) e os cartoes encargos_qtde / encargos_pagos / encargos_a_pagar / encargos_orfaos / juros_pagos / custo_total. juros_pagos = os juros ja'' pagos das parcelas, pela regua do valor_pago da parcela: com lancamento vivo, o lancamento de juros realizado ou conciliado, pelo valor dele; sem lancamento vivo, os juros da parcela ''pago''. custo_total = encargos_pagos + juros_pagos (somas no cru, arredondadas na saida). Pago = realizado ou conciliado.';

CREATE FUNCTION public.fn_encargos_dos_lancamentos(p_cliente uuid)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
begin
  if p_cliente is null or not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  return coalesce((
    select jsonb_object_agg(x.lancamento_id, jsonb_build_object(
             'financiamento_id', f.id, 'papel', x.papel, 'contrato', coalesce(f.descricao, f.numero_contrato)))
      from public.financiamento_encargos x
      join public.financiamentos f on f.id = x.financiamento_id
     where x.cliente_id = p_cliente and x.desfeito_em is null and public._fn_financiamento_vivo(f.status)), '{}'::jsonb);
end
$function$;
REVOKE ALL ON FUNCTION public.fn_encargos_dos_lancamentos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_encargos_dos_lancamentos(uuid) TO authenticated, service_role;

DO $confere$
begin
  if has_function_privilege('anon', 'public.fn_encargos_dos_lancamentos(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_encargos_dos_lancamentos(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_financiamento_situacao(uuid, date, boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_financiamento_situacao(uuid, date, boolean)', 'EXECUTE') then
    raise exception 'ACL diferente do esperado';
  end if;
end
$confere$;
