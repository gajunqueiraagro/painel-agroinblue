-- FINANC-VINCULO-OBRIGATORIO-01 FASE 1 (Gabriel 27/11: mock aprovado; V1 parcela de valor igual senão o contrato; V2 todos com filtro por ano;
-- V3 "Agora não" só fecha) — lote 114540 · Code 2. SÓ LEITURA: nenhum lançamento muda; vincular usa os gravadores que já existem
-- (parcela: fn_financiamento_parcela_vincular · contrato: fn_contrato_encargo_vincular · liberação: fn_financiamento_liberacao_salvar).
--   1. _fn_lancamento_sem_contrato(l)  — A REGRA ÚNICA: lançamento vivo e realizado numa conta de FINANCIAMENTO (Entrada de Financiamento,
--      Amortização Financiamento, Juros de Financiamento — de qualquer atividade, do plano padrão ou do cliente) que não está ligado a contrato
--      nenhum (financiamento_id, parcela, liberação, encargo, captação).
--   2. fn_lancamento_vinculo_pendente(lançamento) — o aviso do modal: pendente? que tipo? e a parcela EM ABERTO de valor EXATAMENTE igual,
--      quando há UMA só (a tela só REALÇA; nenhum contrato vem marcado).
--   3. fn_financiamento_vinculos_pendentes(cliente, ano) — a lista de pendências do cliente (todas; o ano filtra).
-- Funções novas nascem fechadas (sem PUBLIC/anon; tenant_ok). DESFAZER: drop das 3 funções.

create or replace function public._fn_lancamento_sem_contrato(p_lancamento_id uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select exists (
    select 1
      from public.financeiro_lancamentos_v2 l
      join public.financeiro_plano_contas pc on pc.id = l.plano_conta_id
     where l.id = p_lancamento_id
       and not coalesce(l.cancelado, false) and l.cenario = 'realizado'
       and pc.subcentro ~* '^(Entrada de Financiamento|Amortização Financiamento|Juros de Financiamento)'
       and l.financiamento_id is null
       and not exists (select 1 from public.financiamento_parcelas p where p.lancamento_id = l.id or p.lancamento_juros_id = l.id)
       and not exists (select 1 from public.financiamento_liberacoes fl where fl.lancamento_id = l.id and fl.cancelado_em is null)
       and not exists (select 1 from public.financiamento_encargos e where e.lancamento_id = l.id and e.desfeito_em is null)
       and not exists (select 1 from public.financiamentos f where f.lancamento_captacao_id = l.id));
$function$;
revoke all on function public._fn_lancamento_sem_contrato(uuid) from public, anon, authenticated;

create or replace function public.fn_lancamento_vinculo_pendente(p_lancamento_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
declare l public.financeiro_lancamentos_v2%rowtype; v_sub text; v_tipo text; v_exata jsonb; v_n int;
begin
  select * into l from public.financeiro_lancamentos_v2 where id = p_lancamento_id;
  if l.id is null or not coalesce(public.tenant_ok(l.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este lançamento.', detail = coalesce(p_lancamento_id::text, '');
  end if;
  if not public._fn_lancamento_sem_contrato(l.id) then return jsonb_build_object('pendente', false); end if;
  select pc.subcentro into v_sub from public.financeiro_plano_contas pc where pc.id = l.plano_conta_id;
  v_tipo := case when v_sub ~* '^Entrada de Financiamento' then 'captacao' when v_sub ~* '^Amortização' then 'amortizacao' else 'juros' end;
  -- V1: a parcela EM ABERTO do cliente com o valor EXATAMENTE igual (principal na amortização, juros nos juros); só quando é UMA
  if v_tipo in ('amortizacao', 'juros') then
    select count(*), (array_agg(jsonb_build_object('parcela_id', q.id, 'financiamento_id', f.id, 'numero_contrato', f.numero_contrato,
             'numero_parcela', q.numero_parcela, 'data_vencimento', q.data_vencimento, 'papel', case when v_tipo = 'juros' then 'juros' else 'principal' end)))[1]
      into v_n, v_exata
      from public.financiamento_parcelas q join public.financiamentos f on f.id = q.financiamento_id
     where f.cliente_id = l.cliente_id and f.status in ('ativo', 'prorrogado') and coalesce(q.status, '') not in ('pago', 'cancelado')
       and round(case when v_tipo = 'juros' then coalesce(q.valor_juros, 0) else coalesce(q.valor_principal, 0) end, 2) = round(abs(l.valor), 2)
       and (case when v_tipo = 'juros' then q.lancamento_juros_id else q.lancamento_id end) is null;
    if v_n <> 1 then v_exata := null; end if;
  end if;
  return jsonb_build_object('pendente', true, 'tipo', v_tipo, 'subcentro', v_sub, 'parcela_exata', v_exata);
end $function$;
revoke all on function public.fn_lancamento_vinculo_pendente(uuid) from public, anon;
grant execute on function public.fn_lancamento_vinculo_pendente(uuid) to authenticated;

create or replace function public.fn_financiamento_vinculos_pendentes(p_cliente_id uuid, p_ano int default null)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' set plan_cache_mode to 'force_custom_plan' as $function$
declare v_itens jsonb; v_anos jsonb;
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este cliente.', detail = coalesce(p_cliente_id::text, '');
  end if;
  with base as (
    select l.id, coalesce(l.data_pagamento, l.data_competencia) data, abs(l.valor) valor, pc.subcentro, l.descricao,
           (select fo.nome from public.financeiro_fornecedores fo where fo.id = l.favorecido_id) fornecedor,
           case when pc.subcentro ~* '^Entrada de Financiamento' then 'captacao' when pc.subcentro ~* '^Amortização' then 'amortizacao' else 'juros' end tipo
      from public.financeiro_lancamentos_v2 l
      join public.financeiro_plano_contas pc on pc.id = l.plano_conta_id
     where l.cliente_id = p_cliente_id and not coalesce(l.cancelado, false) and l.cenario = 'realizado'
       and pc.subcentro ~* '^(Entrada de Financiamento|Amortização Financiamento|Juros de Financiamento)'
       and public._fn_lancamento_sem_contrato(l.id))
  select coalesce(jsonb_agg(jsonb_build_object('lancamento_id', b.id, 'data', b.data, 'valor', round(b.valor, 2), 'tipo', b.tipo, 'subcentro', b.subcentro,
           'fornecedor', b.fornecedor, 'descricao', b.descricao) order by b.data desc, b.valor desc) filter (where p_ano is null or extract(year from b.data) = p_ano), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('ano', y.ano, 'n', y.n, 'valor', y.v) order by y.ano desc)
                     from (select extract(year from b2.data)::int ano, count(*) n, round(sum(b2.valor), 2) v from base b2 group by 1) y), '[]'::jsonb)
    into v_itens, v_anos
    from base b;
  return jsonb_build_object('ok', true, 'anos', v_anos, 'itens', v_itens);
end $function$;
revoke all on function public.fn_financiamento_vinculos_pendentes(uuid, int) from public, anon;
grant execute on function public.fn_financiamento_vinculos_pendentes(uuid, int) to authenticated;
