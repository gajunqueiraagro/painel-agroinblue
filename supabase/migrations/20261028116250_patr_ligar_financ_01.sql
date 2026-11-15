-- PATR-LIGAR-FINANC-01 (OK do Gabriel 11/11 10:42: D1 = least(liberação, em_uso_desde), D2 tabela nova, D3 IMP-049) — a parte FINANCIADA
-- no custo do bem: a liberação do contrato paga DIRETO ao fornecedor (forma 'fornecedor', sem lançamento de caixa) liga ao bem e soma no
-- valor de aquisição. Uma fonte só: a liberação viva é dona do valor e da data (a ligação não copia valor).
-- 1. `patrimonio_bem_liberacoes` (o molde da `patrimonio_bem_lancamentos`): bem ↔ liberação, desligar com motivo; uma liberação viva liga
--    a UM bem (o contrato JD financia 2 bens: plantadeira e caixa de sementes).
-- 2. `_fn_patrimonio_vinculos` devolve também as liberações ligadas (`lancamento_id` nulo = linha de liberação; `financiamento_id` = o
--    contrato), estado 'soma' na data D1 = least(liberação, em uso desde); liberação removida ou que deixou de ser direta = 'a_conferir'.
--    Série, lista, pastos e ficha somam sem mudar mais nada (patch guardado por md5: o corpo de antes fica byte a byte).
-- 3. `fn_patrimonio_bem_lancamentos` (a lista de LANÇAMENTOS do bem) fica só com lançamento; as liberações têm a leitura delas.
-- 4. Leituras: `fn_patrimonio_bem_liberacoes(bem)` e `fn_patrimonio_liberacoes_sem_bem(cliente)` (diretas ao fornecedor, vivas, sem bem).
-- 5. Escritas com prévia: `fn_patrimonio_bem_ligar_liberacoes` (D3: bem com VALOR INFORMADO só liga confirmando que a liberação o
--    SUBSTITUI — o informado sai na mesma gravação, com trilha antes/depois e motivo; nunca soma duas vezes) e `..._desligar_liberacoes`.
-- Nenhum dado de cliente muda nesta migration: a IMP-049 e a filial 0014-94 → 0015-75 das 2 liberações JD são do Gabriel, pela tela.
set lock_timeout = '2s';

do $$
begin
  if md5(pg_get_functiondef('public._fn_patrimonio_vinculos(uuid,uuid,date)'::regprocedure)) <> '14807352740e1dd25c947ddd6a536eb3' then
    raise exception 'PATR-LIGAR-FINANC-01: _fn_patrimonio_vinculos mudou no banco: refazer o patch.';
  end if;
  if md5(pg_get_functiondef('public.fn_patrimonio_bem_lancamentos(uuid)'::regprocedure)) <> 'ebef7e5e361a17ea6e32f19d00af2c93' then
    raise exception 'PATR-LIGAR-FINANC-01: fn_patrimonio_bem_lancamentos mudou no banco: refazer o patch.';
  end if;
  if to_regclass('public.patrimonio_bem_liberacoes') is not null then
    raise exception 'PATR-LIGAR-FINANC-01: patrimonio_bem_liberacoes já existe.';
  end if;
end $$;

-- 1. a ligação bem ↔ liberação
create table public.patrimonio_bem_liberacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  bem_id uuid not null references public.patrimonio_bens(id),
  liberacao_id uuid not null references public.financiamento_liberacoes(id),
  ligado_em timestamptz not null default now(),
  ligado_por uuid,
  desligado_em timestamptz,
  desligado_por uuid,
  desligado_motivo text,
  constraint patrimonio_bem_liberacoes_desligado_chk check ((desligado_em is null) = (desligado_motivo is null))
);
create unique index patrimonio_bem_liberacoes_vivo_uq on public.patrimonio_bem_liberacoes (liberacao_id) where desligado_em is null;
create index patrimonio_bem_liberacoes_bem_idx on public.patrimonio_bem_liberacoes (bem_id) where desligado_em is null;
create index patrimonio_bem_liberacoes_cliente_idx on public.patrimonio_bem_liberacoes (cliente_id) where desligado_em is null;
alter table public.patrimonio_bem_liberacoes enable row level security;
create policy patrimonio_bem_liberacoes_select on public.patrimonio_bem_liberacoes for select using (public.tenant_ok(cliente_id));
revoke all on public.patrimonio_bem_liberacoes from public, anon, authenticated;
comment on table public.patrimonio_bem_liberacoes is
  'PATR-LIGAR-FINANC-01: a liberação do contrato paga direto ao fornecedor que compõe o custo do bem. O valor e a data são da liberação viva (nunca copiados). Escrita só pelas fn_patrimonio_bem_(des)ligar_liberacoes.';

-- 2. os vínculos do bem passam a trazer as liberações (o corpo de antes intacto + UNION ALL no fim)
do $$
declare
  d text := pg_get_functiondef('public._fn_patrimonio_vinculos(uuid,uuid,date)'::regprocedure);
  a text := E'   where k.cliente_id = p_cliente and k.desligado_em is null and (p_bem is null or k.bem_id = p_bem)\n$function$';
  n text := E'   where k.cliente_id = p_cliente and k.desligado_em is null and (p_bem is null or k.bem_id = p_bem)\n'
    || E'  union all\n'
    || E'  -- PATR-LIGAR-FINANC-01: a liberação direta ao fornecedor ligada ao bem (lancamento_id nulo; financiamento_id = o contrato);\n'
    || E'  -- a data é a D1: least(liberação, em uso desde) — o bem em uso antes de o banco pagar deprecia desde o uso, pelo custo da NF\n'
    || E'  select kl.id, kl.bem_id, null::uuid, 1::smallint, 1::integer, el.estado, el.motivo,\n'
    || E'         case when el.estado = ''a_conferir'' then null else abs(l.valor) end,\n'
    || E'         dl.data, ''liberacao''::text,\n'
    || E'         format(''Financiado · %s · %s'', f.descricao, coalesce(nullif(btrim(l.observacao), ''''), ''liberação de '' || to_char(l.data, ''DD/MM/YYYY''))),\n'
    || E'         l.fornecedor_id, null::uuid, null::text, null::uuid, false, false, kl.ligado_em, l.financiamento_id, false, null::text\n'
    || E'    from public.patrimonio_bem_liberacoes kl\n'
    || E'    join public.financiamento_liberacoes l on l.id = kl.liberacao_id\n'
    || E'    join public.financiamentos f on f.id = l.financiamento_id\n'
    || E'    join public.patrimonio_bens bl on bl.id = kl.bem_id\n'
    || E'    cross join lateral (select least(l.data, coalesce(bl.em_uso_desde, l.data)) as data) dl\n'
    || E'    cross join lateral (\n'
    || E'      select case when l.cancelado_em is not null or l.forma <> ''fornecedor'' then ''a_conferir''\n'
    || E'                  when p_posicao is null or dl.data <= p_posicao then ''soma'' else ''a_realizar'' end as estado,\n'
    || E'             case when l.cancelado_em is not null then ''A liberação foi removida do contrato.''\n'
    || E'                  when l.forma <> ''fornecedor'' then ''A liberação deixou de ser paga direto ao fornecedor.'' end as motivo\n'
    || E'    ) el\n'
    || E'   where kl.cliente_id = p_cliente and kl.desligado_em is null and (p_bem is null or kl.bem_id = p_bem)\n'
    || E'$function$';
begin
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'PATR-LIGAR-FINANC-01: âncora dos vínculos não casa 1x.'; end if;
  execute replace(d, a, n);
end $$;

-- 3. a lista de LANÇAMENTOS do bem segue só com lançamento (as liberações têm a leitura própria)
do $$
declare
  d text := pg_get_functiondef('public.fn_patrimonio_bem_lancamentos(uuid)'::regprocedure);
  a text := E'     order by z.data, z.lancamento_id, z.parte_ordem;';
begin
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'PATR-LIGAR-FINANC-01: âncora dos lançamentos não casa 1x.'; end if;
  execute replace(d, a, E'     where z.lancamento_id is not null\n' || a);
end $$;

-- 4a. as liberações ligadas ao bem (a ficha e o bloco "Financiado" do modal)
create function public.fn_patrimonio_bem_liberacoes(p_bem uuid)
returns table(vinculo_id uuid, liberacao_id uuid, financiamento_id uuid, contrato text, estado text, motivo text, valor numeric,
              data date, data_liberacao date, fornecedor text, fornecedor_cnpj text, observacao text, ligado_em timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare b public.patrimonio_bens%rowtype := public._fn_patrimonio_bem_do_usuario(p_bem);
begin
  return query
    select z.vinculo_id, kl.liberacao_id, z.financiamento_id, f.descricao, z.estado, z.motivo, z.valor, z.data, l.data,
           fo.nome, fo.cpf_cnpj, l.observacao, z.ligado_em
      from public._fn_patrimonio_vinculos(b.cliente_id, b.id, null) z
      join public.patrimonio_bem_liberacoes kl on kl.id = z.vinculo_id
      join public.financiamento_liberacoes l on l.id = kl.liberacao_id
      join public.financiamentos f on f.id = l.financiamento_id
      left join public.financeiro_fornecedores fo on fo.id = l.fornecedor_id and fo.cliente_id = b.cliente_id
     where z.lancamento_id is null
     order by l.data, kl.liberacao_id;
end $$;

-- 4b. as liberações diretas ao fornecedor, vivas e sem bem, do cliente (o que o bloco "Financiado" oferece)
create function public.fn_patrimonio_liberacoes_sem_bem(p_cliente uuid)
returns table(liberacao_id uuid, financiamento_id uuid, contrato text, data date, valor numeric, fornecedor_id uuid, fornecedor text,
              fornecedor_cnpj text, observacao text)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
begin
  if not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  return query
    select l.id, l.financiamento_id, f.descricao, l.data, abs(l.valor), l.fornecedor_id, fo.nome, fo.cpf_cnpj, l.observacao
      from public.financiamento_liberacoes l
      join public.financiamentos f on f.id = l.financiamento_id and f.cliente_id = p_cliente
      left join public.financeiro_fornecedores fo on fo.id = l.fornecedor_id and fo.cliente_id = p_cliente
     where l.cliente_id = p_cliente and l.cancelado_em is null and l.forma = 'fornecedor'
       and not exists (select 1 from public.patrimonio_bem_liberacoes k where k.liberacao_id = l.id and k.desligado_em is null)
     order by l.data desc, f.descricao;
end $$;

-- 5a. ligar liberações ao bem (prévia com p_simular; o valor informado só sai confirmando que a liberação o substitui)
create function public.fn_patrimonio_bem_ligar_liberacoes(p_bem uuid, p_liberacoes jsonb, p_substitui_informado boolean default false,
  p_motivo text default null, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  b public.patrimonio_bens%rowtype := public._fn_patrimonio_bem_do_usuario(p_bem);
  it jsonb; v_lib uuid; l public.financiamento_liberacoes%rowtype; v_sit text; v_mot text; v_outro text; v_contrato text;
  v_res jsonb := '[]'::jsonb; v_n_rec int := 0; v_n_liga int := 0; v_soma numeric := 0; v_primeiro text;
  v_informado numeric; v_antes numeric; v_depois numeric; v_fin uuid;
begin
  if b.situacao = 'baixado' then raise exception using errcode = 'P0001', message = 'Bem baixado não recebe liberação.'; end if;
  if p_liberacoes is null or jsonb_typeof(p_liberacoes) <> 'array' or jsonb_array_length(p_liberacoes) = 0 then
    raise exception using errcode = 'P0001', message = 'Escolha ao menos uma liberação.';
  end if;
  if (select count(*) from jsonb_array_elements_text(p_liberacoes)) <> (select count(distinct x) from jsonb_array_elements_text(p_liberacoes) x) then
    raise exception using errcode = 'P0001', message = 'Uma liberação aparece duas vezes.';
  end if;
  for it in select * from jsonb_array_elements(p_liberacoes) loop
    v_lib := null; v_sit := 'liga'; v_mot := null; v_outro := null; v_contrato := null;
    begin v_lib := nullif(it #>> '{}', '')::uuid; exception when others then v_lib := null; end;
    select x.* into l from public.financiamento_liberacoes x where x.id = v_lib and x.cliente_id = b.cliente_id;
    select f.descricao into v_contrato from public.financiamentos f where f.id = l.financiamento_id;
    if v_lib is null then v_sit := 'recusa'; v_mot := 'Item inválido.';
    elsif l.id is null then v_sit := 'recusa'; v_mot := 'Liberação não encontrada neste cliente.';
    elsif l.cancelado_em is not null then v_sit := 'recusa'; v_mot := 'Liberação removida do contrato não se liga a bem.';
    elsif l.forma <> 'fornecedor' then
      v_sit := 'recusa'; v_mot := 'Só a liberação paga direto ao fornecedor se liga: a de crédito em conta é captação (o bem é o lançamento da compra).';
    else
      select x.descricao into v_outro from public.patrimonio_bem_liberacoes k join public.patrimonio_bens x on x.id = k.bem_id
       where k.liberacao_id = v_lib and k.desligado_em is null and k.bem_id <> b.id;
      if v_outro is not null then v_sit := 'recusa'; v_mot := format('Já está ligada ao bem «%s».', v_outro);
      elsif exists (select 1 from public.patrimonio_bem_liberacoes k where k.liberacao_id = v_lib and k.desligado_em is null and k.bem_id = b.id) then
        v_sit := 'ja_neste_bem';
      end if;
    end if;
    if v_sit = 'recusa' then v_n_rec := v_n_rec + 1; v_primeiro := coalesce(v_primeiro, v_mot); end if;
    if v_sit = 'liga' then v_n_liga := v_n_liga + 1; v_soma := v_soma + abs(l.valor); v_fin := coalesce(v_fin, l.financiamento_id); end if;
    v_res := v_res || jsonb_build_array(jsonb_build_object('liberacao_id', v_lib, 'situacao', v_sit, 'motivo', v_mot, 'contrato', v_contrato,
      'valor', case when l.id is not null then abs(l.valor) end, 'data_liberacao', l.data,
      'data', case when l.id is not null then least(l.data, coalesce(b.em_uso_desde, l.data)) end, 'observacao', l.observacao));
  end loop;

  v_informado := case b.origem_valor when 'sem_lancamento' then b.valor_sem_lancamento
                                     when 'estimativa' then round(b.estimativa_rs_ha * b.estimativa_area_ha, 2) end;
  select coalesce(sum(z.valor) filter (where z.estado = 'soma'), 0) into v_antes from public._fn_patrimonio_vinculos(b.cliente_id, b.id, null) z;
  v_antes := v_antes + coalesce(v_informado, 0);
  v_depois := v_antes + v_soma - case when v_informado is not null and coalesce(p_substitui_informado, false) and v_n_liga > 0 then v_informado else 0 end;

  if p_simular then
    return jsonb_build_object('ok', v_n_rec = 0 and (v_informado is null or coalesce(p_substitui_informado, false)), 'simulado', true,
      'itens', v_res, 'n_ligar', v_n_liga, 'n_recusas', v_n_rec, 'soma_liberacoes', v_soma,
      'origem_valor', b.origem_valor, 'valor_informado', v_informado, 'aquisicao_antes', v_antes, 'aquisicao_depois', v_depois);
  end if;
  if v_n_rec > 0 then
    raise exception using errcode = 'P0001', message = case when v_n_rec = 1 then v_primeiro
      else format('%s liberações não se ligam (a primeira: %s). Nada foi ligado.', v_n_rec, v_primeiro) end;
  end if;
  if v_n_liga = 0 then return jsonb_build_object('ok', true, 'simulado', false, 'n_ligadas', 0, 'aquisicao_depois', v_antes); end if;
  if v_informado is not null and not coalesce(p_substitui_informado, false) then
    raise exception using errcode = 'P0001', message = format(
      'O bem tem valor %s (R$ %s): confirme que a liberação o substitui, senão o custo conta duas vezes.',
      case b.origem_valor when 'estimativa' then 'por estimativa' else 'informado' end, public._fn_brl(v_informado));
  end if;
  if v_informado is not null and nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'Informe o motivo: o valor informado sai do bem.';
  end if;
  begin
    insert into public.patrimonio_bem_liberacoes (cliente_id, bem_id, liberacao_id, ligado_por)
    select b.cliente_id, b.id, (e->>'liberacao_id')::uuid, auth.uid() from jsonb_array_elements(v_res) e where e->>'situacao' = 'liga';
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'Outra pessoa ligou uma destas liberações agora. Recarregue e tente de novo.';
  end;
  if v_informado is not null then
    insert into public.patrimonio_bem_trilha (cliente_id, bem_id, acao, antes, depois, motivo, por)
    values (b.cliente_id, b.id, case when b.situacao = 'em_uso' then 'correcao_em_uso' else 'correcao_cadastro' end,
      jsonb_build_object('origem_valor', b.origem_valor, 'valor_sem_lancamento', b.valor_sem_lancamento,
                         'estimativa_rs_ha', b.estimativa_rs_ha, 'estimativa_area_ha', b.estimativa_area_ha, 'aquisicao', v_antes),
      jsonb_build_object('origem_valor', 'lancamentos', 'liberacoes', (select jsonb_agg(e->'liberacao_id') from jsonb_array_elements(v_res) e where e->>'situacao' = 'liga'),
                         'aquisicao', v_depois),
      btrim(p_motivo), auth.uid());
  end if;
  update public.patrimonio_bens
     set origem_valor = case when v_informado is not null then 'lancamentos' else origem_valor end,
         valor_sem_lancamento = case when v_informado is not null then null else valor_sem_lancamento end,
         estimativa_rs_ha = case when v_informado is not null then null else estimativa_rs_ha end,
         estimativa_area_ha = case when v_informado is not null then null else estimativa_area_ha end,
         financiamento_id = coalesce(financiamento_id, v_fin),
         versao = versao + 1, alterado_em = now(), alterado_por = auth.uid()
   where id = b.id;
  return jsonb_build_object('ok', true, 'simulado', false, 'n_ligadas', v_n_liga, 'aquisicao_antes', v_antes, 'aquisicao_depois', v_depois);
end $$;

-- 5b. desligar (com motivo; a liberação volta para a lista das sem bem)
create function public.fn_patrimonio_bem_desligar_liberacoes(p_bem uuid, p_liberacoes jsonb, p_motivo text, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare b public.patrimonio_bens%rowtype := public._fn_patrimonio_bem_do_usuario(p_bem); v_n int; v_validos int;
begin
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo.'; end if;
  if p_liberacoes is null or jsonb_typeof(p_liberacoes) <> 'array' or jsonb_array_length(p_liberacoes) = 0 then
    raise exception using errcode = 'P0001', message = 'Escolha ao menos uma liberação.';
  end if;
  v_n := jsonb_array_length(p_liberacoes);
  select count(*) into v_validos from jsonb_array_elements_text(p_liberacoes) e
    join public.patrimonio_bem_liberacoes k on k.bem_id = b.id and k.desligado_em is null and k.liberacao_id::text = e;
  if v_validos <> v_n then
    raise exception using errcode = 'P0001', message = 'Alguma liberação escolhida não está ligada a este bem. Nada foi desligado.';
  end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'n_desligar', v_n); end if;
  update public.patrimonio_bem_liberacoes k set desligado_em = now(), desligado_por = auth.uid(), desligado_motivo = btrim(p_motivo)
    from jsonb_array_elements_text(p_liberacoes) e
   where k.bem_id = b.id and k.desligado_em is null and k.liberacao_id::text = e;
  update public.patrimonio_bens set versao = versao + 1, alterado_em = now(), alterado_por = auth.uid() where id = b.id;
  return jsonb_build_object('ok', true, 'simulado', false, 'n_desligadas', v_n);
end $$;

-- as funções novas nascem fechadas (SEG-TENANT-VARREDURA-01C): só `authenticated`; o tenant se confere dentro
revoke all on function public.fn_patrimonio_bem_liberacoes(uuid) from public, anon;
revoke all on function public.fn_patrimonio_liberacoes_sem_bem(uuid) from public, anon;
revoke all on function public.fn_patrimonio_bem_ligar_liberacoes(uuid, jsonb, boolean, text, boolean) from public, anon;
revoke all on function public.fn_patrimonio_bem_desligar_liberacoes(uuid, jsonb, text, boolean) from public, anon;
grant execute on function public.fn_patrimonio_bem_liberacoes(uuid) to authenticated;
grant execute on function public.fn_patrimonio_liberacoes_sem_bem(uuid) to authenticated;
grant execute on function public.fn_patrimonio_bem_ligar_liberacoes(uuid, jsonb, boolean, text, boolean) to authenticated;
grant execute on function public.fn_patrimonio_bem_desligar_liberacoes(uuid, jsonb, text, boolean) to authenticated;
