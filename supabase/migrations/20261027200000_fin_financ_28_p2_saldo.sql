-- FIN-FINANC-28-P2 (Gabriel 17/10/2026) — item 28, passo 2: a FONTE UNICA do saldo devedor do financiamento.
-- Saldo devedor = liberado - amortizado ate' a data pedida, SEM juros futuros (juros projetados ficam no cronograma, como
-- juros previstos). Liberado = soma das liberacoes nao canceladas ate' a data; NULO quando o contrato nao tem nenhuma liberacao
-- gravada (nunca deduzido do valor do contrato nem da captacao). Amortizado = principal pago ate' a data, pela MESMA regra de
-- "paga" de fn_financiamento_situacao (o lancamento vivo decide; sem lancamento vivo, a parcela). Rolado e cancelado: saldo 0 e
-- fora das somas; quitado: saldo 0. Compra parcelada: aplica_saldo false, so' contratado e pago.
-- Pendencias: sem_liberacao (so' no ativo), amortizacao_sem_lancamento (parcela 'pago' de principal zero sem lancamento),
-- liberado_maior_que_contratado, amortizado_maior_que_liberado, sem_numero_contrato.
-- NASCEM: _fn_financiamento_saldo (interna, so' service_role) e fn_financiamento_saldo (guarda tenant_ok + 42501).
-- MUDA, SO' ACRESCENTANDO: fn_financiamento_situacao ganha no fim a chave "saldo" (com e sem p_detalhe); nenhuma chave de
-- antes muda. fn_financiamentos_situacao_lote NAO e' tocada: chama a situacao por contrato e herda a chave.
-- md5(prosrc) da situacao: 4eb6abf080fa8d17d7c03b2577a169eb -> b9f3b1afb49c8e97654a596a81b586d9 (corpo integral, uma troca).
-- Nenhuma tela muda (passos 3 e 7).
SET LOCAL lock_timeout = '2s';

DO $g$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_financiamento_situacao(uuid,date,boolean)'::regprocedure)
     IS DISTINCT FROM '4eb6abf080fa8d17d7c03b2577a169eb' THEN
    RAISE EXCEPTION 'FIN-FINANC-28-P2: fn_financiamento_situacao fora do md5 medido. Abortado.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_financiamentos_situacao_lote(uuid,date)'::regprocedure)
     IS DISTINCT FROM 'd85ccfa3001a373af864e2ef5b130598' THEN
    RAISE EXCEPTION 'FIN-FINANC-28-P2: fn_financiamentos_situacao_lote fora do md5 medido. Abortado.';
  END IF;
END $g$;

CREATE FUNCTION public._fn_financiamento_saldo(p_financiamento_id uuid, p_data date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $f$
declare
  f            public.financiamentos%rowtype;
  v_data       date := coalesce(p_data, current_date);
  v_contratado numeric;
  v_n_lib      int;
  v_liberado   numeric;
  v_amort      numeric;
  v_jpagos     numeric;
  v_jprev      numeric;
  v_zero       int;
  v_saldo      numeric;
  v_regra      text;
  v_fora       boolean := false;
  v_pend       text[] := '{}';
begin
  select * into f from public.financiamentos where id = p_financiamento_id;
  if not found then return null; end if;
  v_contratado := coalesce(f.valor_total, 0) - coalesce(f.valor_entrada, 0);

  -- o pago de cada parcela viva, pela MESMA regra de fn_financiamento_situacao: o lancamento vivo decide (realizado ou
  -- conciliado); sem lancamento vivo nenhum, a parcela ('pago'). Aqui por data: so' o que foi pago ate' v_data.
  with base as (
    select q.status, q.data_pagamento, coalesce(q.valor_principal, 0) as vp, coalesce(q.valor_juros, 0) as vj,
           lp.id as lp_id, lj.id as lj_id,
           coalesce(lp.status_transacao in ('realizado', 'conciliado'), false) as p_real,
           coalesce(lj.status_transacao in ('realizado', 'conciliado'), false) as j_real,
           abs(coalesce(lp.valor, 0)) as lp_valor, abs(coalesce(lj.valor, 0)) as lj_valor,
           lp.data_pagamento as lp_pg, lj.data_pagamento as lj_pg
      from public.financiamento_parcelas q
      left join public.financeiro_lancamentos_v2 lp on lp.id = q.lancamento_id and not coalesce(lp.cancelado, false)
      left join public.financeiro_lancamentos_v2 lj on lj.id = q.lancamento_juros_id and not coalesce(lj.cancelado, false)
                                                    and q.lancamento_juros_id is distinct from q.lancamento_id
     where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado'
  ), pagos as (
    select b.*,
           case when b.lp_id is null and b.lj_id is null
                then b.status = 'pago' and (b.data_pagamento is null or b.data_pagamento <= v_data)
                else b.p_real and (b.lp_pg is null or b.lp_pg <= v_data) end as principal_pago,
           case when b.lp_id is null and b.lj_id is null
                then b.status = 'pago' and (b.data_pagamento is null or b.data_pagamento <= v_data)
                else b.j_real and (b.lj_pg is null or b.lj_pg <= v_data) end as juros_pago
      from base b
  )
  select coalesce(sum(case when principal_pago then case when lp_id is null and lj_id is null then vp else lp_valor end else 0 end), 0),
         coalesce(sum(case when juros_pago then case when lp_id is null and lj_id is null then vj else lj_valor end else 0 end), 0),
         coalesce(sum(case when juros_pago then 0 else vj end), 0),
         count(*) filter (where status = 'pago' and lp_id is null and vp = 0)
    into v_amort, v_jpagos, v_jprev, v_zero
    from pagos;

  if f.natureza = 'parcelamento' then
    -- compra parcelada nao tem saldo devedor de credito: so' o contratado e o pago (o dono dela e' outro escritor)
    return jsonb_build_object('data', v_data, 'natureza', f.natureza, 'status', f.status, 'aplica_saldo', false,
      'contratado', round(v_contratado, 2), 'pago', round(v_amort, 2),
      'liberado', null, 'liberacoes', 0, 'amortizado', null, 'saldo', null, 'juros_pagos', null, 'juros_previstos', null,
      'fora_das_somas', false, 'pendencias', '[]'::jsonb);
  end if;

  select count(*), sum(valor) filter (where data <= v_data) into v_n_lib, v_liberado
    from public.financiamento_liberacoes where financiamento_id = f.id and cancelado_em is null;
  if v_n_lib = 0 then
    v_liberado := null;                       -- sem liberacao gravada: "?" na tela, nunca deduzido do contrato
  else
    v_liberado := coalesce(v_liberado, 0);    -- ha' liberacao, mas nenhuma ate' a data
  end if;

  if f.status in ('cancelado', 'rolado') then
    v_regra := f.status; v_saldo := 0; v_fora := true;
  elsif f.status = 'quitado' then
    v_regra := 'quitado'; v_saldo := 0;
  else
    v_regra := 'calculado'; v_saldo := v_liberado - v_amort;   -- NULL quando liberado e' NULL
  end if;

  if not v_fora then
    if v_n_lib = 0 and v_regra = 'calculado' then v_pend := array_append(v_pend, 'sem_liberacao'); end if;
    if v_zero > 0 then v_pend := array_append(v_pend, 'amortizacao_sem_lancamento'); end if;
    if v_liberado is not null and v_liberado > v_contratado then v_pend := array_append(v_pend, 'liberado_maior_que_contratado'); end if;
    if v_liberado is not null and v_amort > v_liberado then v_pend := array_append(v_pend, 'amortizado_maior_que_liberado'); end if;
    if nullif(btrim(coalesce(f.numero_contrato, '')), '') is null or f.numero_contrato !~ '\d' then
      v_pend := array_append(v_pend, 'sem_numero_contrato');
    end if;
  end if;

  return jsonb_build_object('data', v_data, 'natureza', f.natureza, 'status', f.status, 'aplica_saldo', true, 'regra', v_regra,
    'contratado', round(v_contratado, 2), 'liberado', round(v_liberado, 2), 'liberacoes', v_n_lib,
    'amortizado', round(v_amort, 2), 'saldo', round(v_saldo, 2),
    'juros_pagos', round(v_jpagos, 2), 'juros_previstos', round(v_jprev, 2),
    'parcelas_pagas_sem_lancamento', v_zero, 'fora_das_somas', v_fora, 'pendencias', to_jsonb(v_pend));
end
$f$;

CREATE FUNCTION public.fn_financiamento_saldo(p_financiamento_id uuid, p_data date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $f$
declare v_cli uuid;
begin
  select cliente_id into v_cli from public.financiamentos where id = p_financiamento_id;
  if v_cli is null or not coalesce(public.tenant_ok(v_cli), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  return public._fn_financiamento_saldo(p_financiamento_id, p_data);
end
$f$;

REVOKE ALL ON FUNCTION public._fn_financiamento_saldo(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_financiamento_saldo(uuid, date) TO service_role;
REVOKE ALL ON FUNCTION public.fn_financiamento_saldo(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_financiamento_saldo(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_financiamento_situacao(p_financiamento_id uuid, p_hoje date DEFAULT NULL::date, p_detalhe boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  f       public.financiamentos%rowtype;
  v_hoje  date := coalesce(p_hoje, current_date);
  v_parc  jsonb;
  v_cart  jsonb;
  v_enc   jsonb;
  v_ecart jsonb;
  v_ep    numeric;
  v_jp    numeric;
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

  -- PARC-CONTRATO-01 item 1 (Gabriel, 07/10/2026): O DETALHE DA TELA DO CONTRATO, so' com p_detalhe. Sem ele o retorno e' o de
  -- antes, byte a byte (o lote e os paineis nao pagam por isto). Nada aqui decide situacao: so' acrescenta, a cada parcela ja'
  -- julgada acima, o que a tela mostra ao lado — competencia e conta do LANCAMENTO, o prazo (pago em x vencimento; nao paga, hoje
  -- x vencimento, com o "hoje" que a tela mandou), os documentos vivos do lancamento e os boletos — e, aos cartoes, as contagens.
  if coalesce(p_detalhe, false) then
    select coalesce(jsonb_agg(e.p || jsonb_build_object(
             'competencia', l.data_competencia,
             'conta_id', c.id,
             'conta_nome', coalesce(nullif(c.nome_exibicao, ''), c.nome_conta),
             'tipo_documento', l.tipo_documento,
             'numero_documento', l.numero_documento,
             'prazo', case
                 when (e.p->>'data_vencimento') is null then null
                 when e.p->>'situacao' = 'paga' and (e.p->>'pago_em') is null then null
                 when e.p->>'situacao' = 'paga' then jsonb_build_object(
                        'tipo', case when (e.p->>'pago_em')::date < (e.p->>'data_vencimento')::date then 'antes'
                                     when (e.p->>'pago_em')::date = (e.p->>'data_vencimento')::date then 'no_dia' else 'atraso' end,
                        'dias', abs((e.p->>'pago_em')::date - (e.p->>'data_vencimento')::date))
                 when (e.p->>'data_vencimento')::date < v_hoje then
                      jsonb_build_object('tipo', 'vencida', 'dias', v_hoje - (e.p->>'data_vencimento')::date)
                 else jsonb_build_object('tipo', 'a_vencer', 'dias', (e.p->>'data_vencimento')::date - v_hoje) end,
             'documentos', coalesce(dd.docs, '[]'::jsonb),
             'boletos', coalesce(dd.boletos, 0)
           ) order by e.ord), '[]'::jsonb)
      into v_parc
      from jsonb_array_elements(v_parc) with ordinality e(p, ord)
      left join public.financeiro_lancamentos_v2 l on l.id = (e.p->>'lancamento_id')::uuid
      left join public.financeiro_contas_bancarias c
             on c.id = public._fn_conta_do_lancamento(l.tipo_operacao, l.conta_bancaria_id, l.conta_destino_id)
      left join lateral (
        select jsonb_agg(jsonb_build_object('id', d.documento_id, 'especie', d.especie, 'numero', d.numero, 'valor', d.valor_documento)
                         order by d.uploaded_em, d.documento_id) as docs,
               count(*) filter (where d.especie = 'boleto') as boletos
          from public.vw_lancamento_documentos d
         where d.lancamento_id = l.id and not coalesce(d.cancelado, false)
      ) dd on true;

    -- PARC-CADEIA-01 passo 4: a parcela viva SEM lancamento vivo deixa de ser muda — o que houve com o lancamento dela (quando
    -- foi cancelado e por que). Nulo = a parcela nunca teve lancamento, ou o dela esta' vivo. Nada aqui decide situacao.
    select coalesce(jsonb_agg(e.p || jsonb_build_object(
             'lancamento_cancelado', case when lc.id is not null
                                          then jsonb_build_object('em', lc.cancelado_em, 'motivo', lc.cancelado_motivo) end
           ) order by e.ord), '[]'::jsonb)
      into v_parc
      from jsonb_array_elements(v_parc) with ordinality e(p, ord)
      left join public.financiamento_parcelas q on q.id = (e.p->>'id')::uuid
      left join public.financeiro_lancamentos_v2 lc
             on lc.id = q.lancamento_id and coalesce(lc.cancelado, false) and (e.p->>'lancamento_id') is null;

    v_cart := v_cart || (
      with p as (select e.p from jsonb_array_elements(v_parc) e(p)),
      docs as (
        select distinct on (d->>'id') d->>'id' as id, d->>'especie' as especie, (d->>'valor')::numeric as valor
          from p, jsonb_array_elements(p.p->'documentos') d
         order by d->>'id'
      ), notas as (
        select count(*) as qtde, count(valor) as com_valor, sum(valor) as valor
          from docs where especie in ('nf', 'nf_principal', 'nf_complementar')
      )
      select jsonb_build_object(
        'a_vencer_qtde', (select count(*) from p where p.p->>'situacao' <> 'paga' and (p.p->>'data_vencimento')::date >= v_hoje),
        'vencido_qtde',  (select count(*) from p where p.p->>'situacao' <> 'paga' and (p.p->>'data_vencimento')::date <  v_hoje),
        'notas_qtde', n.qtde,
        'notas_valor', case when n.qtde > 0 and n.com_valor = n.qtde then round(n.valor, 2) end,
        -- nota − soma das parcelas, em centavos: 0 = confere; nulo = nao ha' nota, ou ha' nota sem valor (nao comparavel)
        'notas_diferenca', case when n.qtde > 0 and n.com_valor = n.qtde
                                then round(n.valor, 2) - (v_cart->>'soma_total')::numeric end,
        'boletos', (select count(*) from docs where especie = 'boleto'))
      from notas n);

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

  -- FIN-FINANC-28-P2: o SALDO DEVEDOR (liberado - amortizado ate' o hoje, sem juros futuros) vem da fonte unica, numa chave nova
  -- no fim — nenhuma chave de antes muda (com ou sem p_detalhe; o lote herda).
  return jsonb_build_object('financiamento_id', f.id, 'natureza', f.natureza, 'hoje', v_hoje, 'parcelas', v_parc, 'cartoes', v_cart)
         || case when v_enc is not null then jsonb_build_object('encargos', v_enc) else '{}'::jsonb end
         || jsonb_build_object('saldo', public._fn_financiamento_saldo(f.id, v_hoje));
end
$function$;

DO $c$
DECLARE r record;
BEGIN
  SELECT md5(prosrc) m, proacl::text acl, prosecdef INTO r FROM pg_proc WHERE oid = 'public.fn_financiamento_situacao(uuid,date,boolean)'::regprocedure;
  IF r.m IS DISTINCT FROM 'b9f3b1afb49c8e97654a596a81b586d9' OR NOT r.prosecdef
     OR r.acl IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' THEN
    RAISE EXCEPTION 'FIN-FINANC-28-P2: situacao gravada fora do esperado: % % %', r.m, r.prosecdef, r.acl;
  END IF;
  IF has_function_privilege('anon', 'public.fn_financiamento_saldo(uuid,date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public._fn_financiamento_saldo(uuid,date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_financiamento_saldo(uuid,date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_financiamento_saldo(uuid,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FIN-FINANC-28-P2: ACL das funcoes do saldo fora do esperado';
  END IF;
END $c$;
