-- FIN-PARCELA-VALOR-ZERO-01 (Gabriel 05/11/2026, achado (a) do FIN-FINANC-LAYOUT-01): PARCELA DE VALOR ZERO NAO VENCE.
-- Parcela sem nada a pagar (principal = juros = encargos = total = 0, e as colunas do consorcio tambem 0) e' nao paga nunca vira
-- "vencida": a situacao fica 'pendente' (o mesmo valor de antes — a tela publicada continua lendo) e a parcela ganha a chave
-- 'sem_valor' = true, so' nela (as outras saem byte a byte como antes). Fica fora das contagens de vencidas / a vencer / adiadas,
-- sem prazo no detalhe, e com isso fora da pendencia "parcelas vencidas sem pagamento" do fn_contrato_tela (que conta vencido_qtde).
-- A tela mostra "sem pagamento", cinza.
-- Vem DEPOIS da 20261028113095 (FIN-PARCELAS-TOTAL-01): sem ela, as 88 parcelas de total zero e principal + juros > 0 nao entram
-- aqui de qualquer forma (a regra exige principal + juros + encargos = 0), mas a ordem fica a do achado.
-- Paga continua paga (as 27 de valor zero de hoje estao todas pagas: nada muda nelas). Lancamento vivo que decide 'paga'/'parcial'
-- continua decidindo.
create or replace function public.fn_financiamento_situacao(p_financiamento_id uuid, p_hoje date default null::date, p_detalhe boolean default false)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
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
           -- FIN-PARCELA-VALOR-ZERO-01: nada a pagar nesta parcela (nenhuma coluna de valor)
           (coalesce(q.valor_principal, 0) = 0 and coalesce(q.valor_juros, 0) = 0 and coalesce(q.valor_encargos, 0) = 0
            and coalesce(q.valor_total, 0) = 0 and coalesce(q.valor_fundo_comum, 0) = 0 and coalesce(q.valor_taxa_adm, 0) = 0
            and coalesce(q.valor_fundo_reserva, 0) = 0 and coalesce(q.valor_seguro, 0) = 0) as zero,
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
           case when public._fn_parcela_pelos_lancamentos(case when b.lp_id is not null then coalesce(b.lp_status, '') end, case when b.lj_id is not null then coalesce(b.lj_status, '') end) is null then 'parcela' else 'lancamento' end as fonte
      from base b
  ), sit0 as (
    select d.*,
           case
             when d.fonte = 'parcela' then case when d.status = 'pago' then 'paga'
                                                when d.zero then 'pendente'
                                                when d.data_vencimento < v_hoje then 'vencida' else 'pendente' end
             -- FIN-PARCELA-STATUS-01: a regra e' a de _fn_parcela_pelos_lancamentos (uma so', a mesma do gatilho da coluna)
             when public._fn_parcela_pelos_lancamentos(case when d.lp_id is not null then coalesce(d.lp_status, '') end, case when d.lj_id is not null then coalesce(d.lj_status, '') end) = 'paga' then 'paga'
             when public._fn_parcela_pelos_lancamentos(case when d.lp_id is not null then coalesce(d.lp_status, '') end, case when d.lj_id is not null then coalesce(d.lj_status, '') end) = 'parcial' then 'parcial'
             when d.zero then 'pendente'
             when d.data_vencimento < v_hoje then 'vencida'
             else 'pendente'
           end as situacao,
           case
             when d.fonte = 'parcela' then case when d.status = 'pago' then d.vt else 0 end
             else coalesce(d.p_real, 0) * d.lp_valor + coalesce(d.j_real, 0) * d.lj_valor
           end as valor_pago,
           case
             when d.fonte = 'parcela' then case when d.status = 'pago' then d.data_pagamento end
             when public._fn_parcela_pelos_lancamentos(case when d.lp_id is not null then coalesce(d.lp_status, '') end, case when d.lj_id is not null then coalesce(d.lj_status, '') end) in ('paga', 'parcial') then greatest(case when d.p_real = 1 then d.lp_pg end, case when d.j_real = 1 then d.lj_pg end)
           end as pago_em
      from der d
  ), sit as (
    -- FIN-PARCELA-VALOR-ZERO-01: a de valor zero nao paga (nem paga em parte) fica fora das contagens de vencidas / a vencer
    select s0.*, (s0.zero and s0.situacao = 'pendente') as sem_valor from sit0 s0
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
    ) || case when s.sem_valor then jsonb_build_object('sem_valor', true) else '{}'::jsonb end
      order by s.numero_parcela, s.data_vencimento, s.id), '[]'::jsonb),
    jsonb_build_object(
      'valor_contrato', round(coalesce(f.valor_total, 0), 2),
      'pago', round(coalesce(sum(s.valor_pago), 0), 2),
      'a_vencer', round(coalesce(sum(case when s.situacao <> 'paga' and s.data_vencimento >= v_hoje then greatest(s.vt - s.valor_pago, 0) else 0 end), 0), 2),
      'vencido', round(coalesce(sum(case when s.situacao <> 'paga' and s.data_vencimento < v_hoje then greatest(s.vt - s.valor_pago, 0) else 0 end), 0), 2),
      -- FIN-PARCELA-STATUS-01 (adiadas): parcela sem vencimento (adiada do consorcio, ate' a contemplacao) nao e' vencida nem a vencer; fica
      -- aqui, para o em aberto do contrato nao a perder
      'adiado', round(coalesce(sum(case when s.situacao <> 'paga' and s.data_vencimento is null then greatest(s.vt - s.valor_pago, 0) else 0 end), 0), 2),
      'adiado_qtde', count(*) filter (where s.situacao <> 'paga' and s.data_vencimento is null and not s.sem_valor),
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
                 -- FIN-PARCELA-VALOR-ZERO-01: sem nada a pagar, sem prazo (nem "vencida ha'", nem "vence em")
                 when coalesce((e.p->>'sem_valor')::boolean, false) then null
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
      -- FIN-PARCELA-VALOR-ZERO-01: a de valor zero nao paga nao conta como vencida nem como a vencer
      with p as (select e.p, coalesce((e.p->>'sem_valor')::boolean, false) as sem_valor from jsonb_array_elements(v_parc) e(p)),
      docs as (
        select distinct on (d->>'id') d->>'id' as id, d->>'especie' as especie, (d->>'valor')::numeric as valor
          from p, jsonb_array_elements(p.p->'documentos') d
         order by d->>'id'
      ), notas as (
        select count(*) as qtde, count(valor) as com_valor, sum(valor) as valor
          from docs where especie in ('nf', 'nf_principal', 'nf_complementar')
      )
      select jsonb_build_object(
        'a_vencer_qtde', (select count(*) from p where not p.sem_valor and p.p->>'situacao' <> 'paga' and (p.p->>'data_vencimento')::date >= v_hoje),
        'vencido_qtde',  (select count(*) from p where not p.sem_valor and p.p->>'situacao' <> 'paga' and (p.p->>'data_vencimento')::date <  v_hoje),
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
