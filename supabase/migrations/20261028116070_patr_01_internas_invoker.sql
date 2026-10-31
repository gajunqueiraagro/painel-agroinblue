-- PATR-01 · 116070 — as duas INTERNAS do Patrimônio que recebem o cliente passam a SECURITY INVOKER (o gate
-- `guardaDeClienteNasMigrations.test.ts` reprovou a 116060: SECURITY DEFINER com parâmetro de cliente e sem guarda).
-- ⚠ NADA MUDA NO RESULTADO: as duas só são chamadas de dentro das `fn_patrimonio_*` (todas SECURITY DEFINER, com a guarda
-- `tenant_ok`/`_fn_patrimonio_bem_do_usuario`), e dentro delas quem roda é o dono — a invoker herda isso. Continuam fechadas
-- (REVOKE de PUBLIC/anon/authenticated, só service_role), agora sem atravessar a RLS por conta própria.
-- O corpo é o da 116060, byte a byte; muda só `security definer` → `security invoker` (o diff prova).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- os vinculos de um cliente (ou de um bem), com o estado de cada um. p_posicao: o que tem data depois dela conta como 'a_realizar'.
-- DATA: coalesce(competencia, pagamento) (3.6); parcela de principal de contrato de parcelamento/consorcio: a data do contrato.
-- 'soma' = realizado OU parcela de principal de contrato (prevista inclusive: o bem entra pelo valor total do contrato).
-- `selo`: o lancamento tem hoje outro numero de partes do que tinha ao ligar (segue somando; aparece "a conferir").
create or replace function public._fn_patrimonio_vinculos(p_cliente uuid, p_bem uuid default null, p_posicao date default null)
returns table (vinculo_id uuid, bem_id uuid, lancamento_id uuid, parte_ordem smallint, partes_total integer, estado text, motivo text,
               valor numeric, data date, status_transacao text, descricao text, favorecido_id uuid, plano_conta_id uuid,
               subcentro text, fazenda_id uuid, repetida boolean, repetida_confirmada boolean, ligado_em timestamptz,
               financiamento_id uuid, de_contrato boolean, selo text)
language sql stable security invoker set search_path = pg_catalog, public
as $$
  select k.id, k.bem_id, k.lancamento_id, k.parte_ordem, v.partes_total, e.estado, e.motivo,
         case when e.estado = 'a_conferir' then null
              when v.tipo_operacao like '1%' then -abs(v.valor) else abs(v.valor) end,
         d.data, v.status_transacao, v.descricao, v.favorecido_id, v.plano_conta_id,
         v.subcentro, v.fazenda_id, coalesce(v.status_duplicidade = 'pendente', false), k.repetida_confirmada, k.ligado_em,
         v.financiamento_id, c.de_contrato,
         case when e.estado <> 'a_conferir' and v.partes_total is distinct from k.partes_total_ao_ligar::int
              then 'O lançamento foi dividido de outro jeito depois de ligado: confira a parte.' end
    from public.patrimonio_bem_lancamentos k
    left join public.vw_fin_classificacao_por_parte v
      on v.lancamento_id = k.lancamento_id and v.parte_ordem = k.parte_ordem and v.cliente_id = k.cliente_id
    cross join lateral (
      select coalesce(v.financiamento_id is not null and v.origem_tipo = 'parcela_principal'
               and exists (select 1 from public.financiamentos f where f.id = v.financiamento_id and f.natureza in ('parcelamento', 'consorcio')),
             false) as de_contrato
    ) c
    cross join lateral (
      select case when c.de_contrato then public._fn_patrimonio_data_do_contrato(v.financiamento_id)
                  else coalesce(v.data_competencia, v.data_pagamento) end as data
    ) d
    cross join lateral (
      select case
               when v.lancamento_id is null then 'a_conferir'
               when v.cancelado is true then 'a_conferir'
               when not public._fn_patrimonio_conta_investimento(v.plano_conta_id) then 'a_conferir'
               when (c.de_contrato or v.status_transacao = 'realizado')
                    and (p_posicao is null or d.data <= p_posicao) then 'soma'
               else 'a_realizar' end as estado,
             case
               when v.lancamento_id is null then 'A parte ligada não existe mais (o lançamento foi dividido de novo ou apagado).'
               when v.cancelado is true then 'O lançamento foi cancelado.'
               when not public._fn_patrimonio_conta_investimento(v.plano_conta_id) then 'A parte deixou de ser de Investimento.'
             end as motivo
    ) e
   where k.cliente_id = p_cliente and k.desligado_em is null and (p_bem is null or k.bem_id = p_bem)
$$;

-- a serie mensal da depreciacao (a regra do cabecalho). So' bens em uso/baixados de categoria que deprecia.
create or replace function public._fn_patrimonio_serie(p_cliente uuid, p_bem uuid, p_ate date)
returns table (bem_id uuid, mes date, base numeric, depreciavel numeric, quota numeric, acumulada numeric,
               vida_util_meses integer, residual_pct numeric)
language plpgsql stable security invoker set search_path = pg_catalog, public
as $$
declare
  b record; u date; fim date; m date; v_extra numeric;
  c_val numeric[]; c_mes date[]; p_des date[]; p_vid integer[]; p_res numeric[];
  v_base numeric; v_dep numeric; v_vida integer; v_resid numeric; a_prev numeric; a_ini numeric; a numeric; r integer; j integer;
  i integer; v_novo boolean;
begin
  for b in
    select x.* from public.patrimonio_bens x join public.patrimonio_categorias c on c.id = x.categoria_id
     where x.cliente_id = p_cliente and (p_bem is null or x.id = p_bem)
       and x.situacao in ('em_uso', 'baixado') and x.em_uso_desde is not null and c.deprecia
     order by x.id
  loop
    u := date_trunc('month', b.em_uso_desde)::date;
    fim := date_trunc('month', p_ate)::date;
    if b.baixado_em is not null then fim := least(fim, (date_trunc('month', b.baixado_em) - interval '1 month')::date); end if;
    continue when fim < u;

    v_extra := case b.origem_valor when 'sem_lancamento' then b.valor_sem_lancamento
                                   when 'estimativa' then round(b.estimativa_rs_ha * b.estimativa_area_ha, 2) else 0 end;
    select coalesce(array_agg(z.valor order by z.data), '{}'), coalesce(array_agg(greatest(u, date_trunc('month', z.data)::date) order by z.data), '{}')
      into c_val, c_mes
      from public._fn_patrimonio_vinculos(p_cliente, b.id, null) z where z.estado = 'soma';
    select coalesce(array_agg(q.vigente_desde order by q.vigente_desde), '{}'), coalesce(array_agg(q.vida_util_meses order by q.vigente_desde), '{}'),
           coalesce(array_agg(q.residual_pct order by q.vigente_desde), '{}')
      into p_des, p_vid, p_res
      from public.patrimonio_bem_parametros q where q.bem_id = b.id;
    continue when cardinality(p_des) = 0;

    a_prev := 0; m := u;
    while m <= fim loop
      v_novo := (m = u) or (m = any (c_mes) and m > u) or (m = any (p_des) and m > u);
      if v_novo then
        v_base := v_extra;
        for i in 1 .. coalesce(cardinality(c_val), 0) loop
          if c_mes[i] <= m then v_base := v_base + c_val[i]; end if;
        end loop;
        v_vida := p_vid[1]; v_resid := p_res[1];
        for i in 1 .. cardinality(p_des) loop
          if p_des[i] <= m then v_vida := p_vid[i]; v_resid := p_res[i]; end if;
        end loop;
        v_dep := round(v_base * (1 - v_resid / 100), 2);
        a_ini := a_prev; j := 0;
        r := case when v_vida is null then 1 else greatest(v_vida - public._fn_patrimonio_meses(u, m), 1) end;
      end if;
      j := j + 1;
      if v_vida is null then a := a_ini;
      else a := a_ini + round(greatest(v_dep - a_ini, 0) * least(j, r) / r, 2); end if;
      bem_id := b.id; mes := m; base := v_base; depreciavel := v_dep; quota := a - a_prev; acumulada := a;
      vida_util_meses := v_vida; residual_pct := v_resid;
      return next;
      a_prev := a;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;
end $$;

revoke all on function public._fn_patrimonio_vinculos(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public._fn_patrimonio_serie(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public._fn_patrimonio_vinculos(uuid, uuid, date) to service_role;
grant execute on function public._fn_patrimonio_serie(uuid, uuid, date) to service_role;
