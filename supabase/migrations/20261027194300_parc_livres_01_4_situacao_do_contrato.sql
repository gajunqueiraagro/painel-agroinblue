-- PARC-LIVRES-01 (passo 4) — PAGOU NO FINANCEIRO, O CONTRATO MOSTRA (Gabriel, 06/10/2026).
--
-- O DONO DA SITUACAO "PAGA" E' O LANCAMENTO. `fn_financiamento_situacao(p_financiamento_id, p_hoje)` e' a leitura UNICA da tela do
-- contrato: devolve as parcelas VIVAS (a cancelada nao entra) com a situacao DERIVADA e os cartoes PRONTOS. So' leitura; nada e'
-- copiado para `financiamento_parcelas` (nenhum gatilho de sincronia) e nada e' acertado por UPDATE.
--   · parcela com lancamento vivo (principal e, no financiamento, juros): PAGA quando TODOS os lancamentos vivos dela estao
--     realizados ou conciliados (pago_em = a maior data de pagamento; valor_pago = a soma deles); com so' ALGUM realizado, 'parcial'
--     (valor_pago = o realizado; o resto conta como vencido ou a vencer); senao VENCIDA (vencimento < hoje) ou PENDENTE.
--   · parcela SEM lancamento vivo (legado: nasceu antes do espelho, ou o lancamento foi cancelado): nao ha' dono — vale a parcela
--     (`status = 'pago'`), marcada `fonte = 'parcela'`.
--   · `diverge` = a coluna `status` da parcela diz outra coisa que a situacao derivada (informacao; vale o lancamento).
--   · cartoes: valor_contrato, pago, a_vencer, vencido, pagas, parcelas, juros_previstos, soma_principal, soma_total.
-- `p_hoje` e' a data LOCAL de quem olha (a tela manda a dela); sem ela, a do servidor.

CREATE OR REPLACE FUNCTION public.fn_financiamento_situacao(p_financiamento_id uuid, p_hoje date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  f       public.financiamentos%rowtype;
  v_hoje  date := coalesce(p_hoje, current_date);
  v_parc  jsonb;
  v_cart  jsonb;
begin
  select * into f from public.financiamentos where id = p_financiamento_id;
  if not found or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;

  with base as (
    select q.id, q.numero_parcela, q.data_vencimento, q.status, q.data_pagamento,
           coalesce(q.valor_principal, 0) as vp, coalesce(q.valor_juros, 0) as vj,
           coalesce(q.valor_principal, 0) + coalesce(q.valor_juros, 0) as vt,
           lp.id as lp_id, lj.id as lj_id,
           (lp.id is not null)::int + (lj.id is not null)::int as n_vivos,
           (lp.status_transacao in ('realizado', 'conciliado'))::int as p_real,
           (lj.status_transacao in ('realizado', 'conciliado'))::int as j_real,
           abs(coalesce(lp.valor, 0)) as lp_valor, abs(coalesce(lj.valor, 0)) as lj_valor,
           lp.data_pagamento as lp_pg, lj.data_pagamento as lj_pg,
           lp.status_transacao as lp_status, lj.status_transacao as lj_status
      from public.financiamento_parcelas q
      left join public.financeiro_lancamentos_v2 lp on lp.id = q.lancamento_id and not coalesce(lp.cancelado, false)
      left join public.financeiro_lancamentos_v2 lj on lj.id = q.lancamento_juros_id and not coalesce(lj.cancelado, false)
                                                    and q.lancamento_juros_id is distinct from q.lancamento_id
     where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado'
  ), der as (
    select b.*,
           coalesce(b.p_real, 0) + coalesce(b.j_real, 0) as n_real,
           case when b.n_vivos = 0 then 'parcela' else 'lancamento' end as fonte
      from base b
  ), sit as (
    select d.*,
           case
             when d.fonte = 'parcela' then case when d.status = 'pago' then 'paga'
                                                when d.data_vencimento < v_hoje then 'vencida' else 'pendente' end
             when d.n_real = d.n_vivos then 'paga'
             when d.n_real > 0 then 'parcial'
             when d.data_vencimento < v_hoje then 'vencida'
             else 'pendente'
           end as situacao,
           case
             when d.fonte = 'parcela' then case when d.status = 'pago' then d.vt else 0 end
             else coalesce(d.p_real, 0) * d.lp_valor + coalesce(d.j_real, 0) * d.lj_valor
           end as valor_pago,
           case
             when d.fonte = 'parcela' then case when d.status = 'pago' then d.data_pagamento end
             when d.n_real > 0 then greatest(case when d.p_real = 1 then d.lp_pg end, case when d.j_real = 1 then d.lj_pg end)
           end as pago_em
      from der d
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'numero', s.numero_parcela, 'data_vencimento', s.data_vencimento,
      'valor_principal', round(s.vp, 2), 'valor_juros', round(s.vj, 2), 'valor_total', round(s.vt, 2),
      'situacao', s.situacao, 'pago_em', s.pago_em, 'valor_pago', round(s.valor_pago, 2),
      'lancamento_id', s.lp_id, 'lancamento_juros_id', s.lj_id,
      'lancamento_status', s.lp_status, 'juros_status', s.lj_status,
      'fonte', s.fonte,
      'diverge', (s.situacao = 'paga') is distinct from (coalesce(s.status, '') = 'pago')
    ) order by s.numero_parcela, s.data_vencimento, s.id), '[]'::jsonb),
    jsonb_build_object(
      'valor_contrato', round(coalesce(f.valor_total, 0), 2),
      'pago', round(coalesce(sum(s.valor_pago), 0), 2),
      'a_vencer', round(coalesce(sum(case when s.situacao <> 'paga' and s.data_vencimento >= v_hoje then greatest(s.vt - s.valor_pago, 0) else 0 end), 0), 2),
      'vencido', round(coalesce(sum(case when s.situacao <> 'paga' and s.data_vencimento < v_hoje then greatest(s.vt - s.valor_pago, 0) else 0 end), 0), 2),
      'pagas', count(*) filter (where s.situacao = 'paga'),
      'parcelas', count(*),
      'juros_previstos', round(coalesce(sum(s.vj), 0), 2),
      'soma_principal', round(coalesce(sum(s.vp), 0), 2),
      'soma_total', round(coalesce(sum(s.vt), 0), 2),
      'divergentes', count(*) filter (where (s.situacao = 'paga') is distinct from (coalesce(s.status, '') = 'pago'))
    )
    into v_parc, v_cart
    from sit s;

  return jsonb_build_object('financiamento_id', f.id, 'natureza', f.natureza, 'hoje', v_hoje, 'parcelas', v_parc, 'cartoes', v_cart);
end
$function$;

REVOKE ALL ON FUNCTION public.fn_financiamento_situacao(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_financiamento_situacao(uuid, date) TO authenticated, service_role;
