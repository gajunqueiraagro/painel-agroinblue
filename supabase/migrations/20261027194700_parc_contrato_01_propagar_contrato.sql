-- PARC-CONTRATO-01 (item 2) — PROPAGAR A EDICAO DO CONTRATO A'S PARCELAS (Gabriel, 05 e 07/10/2026).
--
-- Queixa: mudou o nome do contrato para "Lascas Eucalipto Tratado" e as parcelas no Financeiro seguiram "LASCAS DE EUCALIP… 4/6";
-- descricao, forma de pagamento e classificacao mudadas no Editar obrigacao nao chegavam a's parcelas.
--
-- `fn_parcelamento_propagar(p_financiamento_id, p_campos, p_escopo, p_simular)` — UMA funcao, atomica: grava no CONTRATO os campos
-- que sao coluna dele e nos LANCAMENTOS DAS PARCELAS os mesmos campos, na mesma transacao. So' parcelamento (financiamento com
-- juros tem outro escritor, o motor). SIMULACAO = GRAVACAO: `p_simular` percorre as MESMAS linhas e conta as mesmas mudancas, so'
-- nao escreve.
--   p_campos: so' as chaves que mudam — descricao, credor_id, forma_pagamento, conta_bancaria_id, fazenda_id, plano_conta_id,
--     safra_id, cultura, fase. Chave presente com nulo/vazio = limpar (safra, cultura, fase, forma). Qualquer outra chave e'
--     RECUSADA com frase: data e valor de parcela nao se propagam (editam-se na grade de parcelas, a RPC do 2B).
--   p_escopo: 'futuros' = as parcelas NAO pagas; 'todos' = todas, e nas PAGAS mudam SO' descricao e classificacao (plano, safra,
--     cultura, fase) — forma, conta, credor, fazenda, data e valor da paga nao mudam nunca; 'nenhum' = nada e' escrito aqui.
--   PAGA = a regra do 2B (`_fn_parcela_de_parcelamento_paga`).
--   O NOME: sempre por `_fn_parcela_descricao(descricao, i, N)` (o "i/N" fica). NOME PROPRIO NAO E' SOBRESCRITO, e nome proprio e'
--     o que NAO TERMINA no "i/N" da propria parcela (forma nova "X i/N" ou a antiga "X - Parcela i/N"). O que termina nele e' nome
--     GERADO, qualquer que seja a base: e' isto que alcanca o contrato que ja' foi renomeado antes sem propagar (as parcelas
--     ficaram com a descricao ANTIGA + "i/N") e a parcela paga que ficou para tras num "so' os futuros".
--   Retorno: parcelas {nao_pagas, pagas}, nome_proprio {nao_pagas, pagas}, campos [{campo, de, para, nao_pagas, pagas, nas_pagas}],
--     alteradas {futuros, todos} (lancamentos que cada escopo muda) e gravadas (os que ESTA chamada escreveu).
-- Funcao nova nasce fechada: GRANT a authenticated e service_role aqui. SECURITY DEFINER com `tenant_ok`, 42501.

CREATE FUNCTION public.fn_parcelamento_propagar(p_financiamento_id uuid, p_campos jsonb, p_escopo text, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  c_chaves    constant text[] := array['descricao','credor_id','forma_pagamento','conta_bancaria_id','fazenda_id','plano_conta_id','safra_id','cultura','fase'];
  c_das_pagas constant text[] := array['descricao','plano_conta_id','safra_id','cultura','fase'];
  f        public.financiamentos%rowtype;
  r        record;
  v_k      text;
  v_n      int;
  v_moda   text;
  v_desc   text := nullif(btrim(coalesce(p_campos->>'descricao', '')), '');
  v_credor uuid; v_conta uuid; v_faz uuid; v_plano uuid; v_safra uuid;
  v_forma  text := nullif(btrim(coalesce(p_campos->>'forma_pagamento', '')), '');
  v_cult   text := nullif(btrim(coalesce(p_campos->>'cultura', '')), '');
  v_fase   text := nullif(btrim(coalesce(p_campos->>'fase', '')), '');
  v_paga   boolean; v_gerado boolean; v_novo_nome text;
  v_muda   text[];
  v_np int := 0; v_pg int := 0; v_prop_np int := 0; v_prop_pg int := 0;
  v_alt_fut int := 0; v_alt_tod int := 0; v_grav int := 0;
  v_cont   jsonb := '{}'::jsonb;   -- campo -> {nao_pagas, pagas}
  v_campos jsonb := '[]'::jsonb;
  v_de text; v_para text; v_dist int;
begin
  if coalesce(p_simular, true) then
    select * into f from public.financiamentos where id = p_financiamento_id;
  else
    select * into f from public.financiamentos where id = p_financiamento_id for update;
  end if;
  if not found or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if f.natureza is distinct from 'parcelamento' then
    raise exception using errcode = '22023', message = 'Só parcelamento propaga a edição do contrato às parcelas. Nada foi gravado.';
  end if;
  if p_escopo is null or p_escopo not in ('futuros', 'todos', 'nenhum') then
    raise exception using errcode = '22023', message = 'Escolha até onde a alteração vai: só os futuros, futuros e passados, ou não propagar.';
  end if;
  if p_campos is null or jsonb_typeof(p_campos) <> 'object' then
    raise exception using errcode = '22023', message = 'Nada a propagar: nenhum campo informado.';
  end if;
  for v_k in select jsonb_object_keys(p_campos) loop
    if v_k = any (array['valor','valor_total','valor_principal','data_vencimento','data_pagamento','data_competencia']) then
      raise exception using errcode = '22023',
        message = 'Data e valor de parcela não se propagam pelo contrato: edite na grade de parcelas. Parcela paga nunca muda data nem valor. Nada foi gravado.';
    end if;
    if not (v_k = any (c_chaves)) then
      raise exception using errcode = '22023', message = format('O campo "%s" não se propaga às parcelas. Nada foi gravado.', v_k);
    end if;
  end loop;
  if p_campos ? 'descricao' and v_desc is null then
    raise exception using errcode = '22023', message = 'A descrição do contrato não pode ficar vazia. Nada foi gravado.';
  end if;

  -- os cadastros informados tem de ser DESTE cliente (o plano pode ser o global)
  v_credor := nullif(p_campos->>'credor_id', '')::uuid;
  v_conta  := nullif(p_campos->>'conta_bancaria_id', '')::uuid;
  v_faz    := nullif(p_campos->>'fazenda_id', '')::uuid;
  v_plano  := nullif(p_campos->>'plano_conta_id', '')::uuid;
  v_safra  := nullif(p_campos->>'safra_id', '')::uuid;
  if (v_credor is not null and not exists (select 1 from public.financeiro_fornecedores x where x.id = v_credor and x.cliente_id = f.cliente_id))
     or (v_conta is not null and not exists (select 1 from public.financeiro_contas_bancarias x where x.id = v_conta and x.cliente_id = f.cliente_id))
     or (v_faz is not null and not exists (select 1 from public.fazendas x where x.id = v_faz and x.cliente_id = f.cliente_id))
     or (v_safra is not null and not exists (select 1 from public.financeiro_safras x where x.id = v_safra and x.cliente_id = f.cliente_id))
     or (v_plano is not null and not exists (select 1 from public.financeiro_plano_contas x where x.id = v_plano and (x.cliente_id is null or x.cliente_id = f.cliente_id))) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if (p_campos ? 'plano_conta_id' and v_plano is null) or (p_campos ? 'fazenda_id' and v_faz is null) then
    raise exception using errcode = '22023', message = 'Classificação e fazenda não podem ficar vazias. Nada foi gravado.';
  end if;
  if v_cult is not null and not (v_cult = any (public._fn_culturas_lancamento())) then
    raise exception using errcode = '22023', message = format('Cultura "%s" fora da lista. Nada foi gravado.', v_cult);
  end if;

  v_n := f.total_parcelas;

  -- a BASE mais comum dos nomes gerados (o nome sem o "i/N" do fim): e' o "de" que a previa mostra para a descricao
  select b.base into v_moda from (
    select regexp_replace(l.descricao, '(\s+-\s+Parcela)?\s*' || q.numero_parcela || '/' || v_n || '\s*$', '') as base, count(*) as n
      from public.financiamento_parcelas q
      join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_id and not coalesce(l.cancelado, false)
     where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado'
       and l.descricao ~ ('(^|\s)' || q.numero_parcela || '/' || v_n || '\s*$')
     group by 1
     order by 2 desc, 1 limit 1) b;

  for r in
    select q.id as parcela_id, q.numero_parcela, q.status, l.id as lanc_id, l.descricao, l.favorecido_id, l.forma_pagamento,
           l.conta_bancaria_id, l.fazenda_id, l.plano_conta_id, l.safra_id, l.cultura, l.fase
      from public.financiamento_parcelas q
      join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_id and not coalesce(l.cancelado, false)
     where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado'
     order by q.numero_parcela, q.id
  loop
    v_paga := public._fn_parcela_de_parcelamento_paga(r.status, r.lanc_id);
    if v_paga then v_pg := v_pg + 1; else v_np := v_np + 1; end if;
    v_muda := array[]::text[];

    if p_campos ? 'descricao' then
      v_gerado := r.descricao ~ ('(^|\s)' || r.numero_parcela || '/' || v_n || '\s*$');
      v_novo_nome := public._fn_parcela_descricao(v_desc, r.numero_parcela, v_n);
      if not v_gerado then
        if r.descricao is distinct from v_novo_nome then
          if v_paga then v_prop_pg := v_prop_pg + 1; else v_prop_np := v_prop_np + 1; end if;
        end if;
      elsif r.descricao is distinct from v_novo_nome then
        v_muda := array_append(v_muda, 'descricao');
      end if;
    end if;
    if p_campos ? 'credor_id'         and not v_paga and r.favorecido_id     is distinct from v_credor then v_muda := array_append(v_muda, 'credor_id'); end if;
    if p_campos ? 'forma_pagamento'   and not v_paga and r.forma_pagamento   is distinct from v_forma  then v_muda := array_append(v_muda, 'forma_pagamento'); end if;
    if p_campos ? 'conta_bancaria_id' and not v_paga and r.conta_bancaria_id is distinct from v_conta  then v_muda := array_append(v_muda, 'conta_bancaria_id'); end if;
    if p_campos ? 'fazenda_id'        and not v_paga and r.fazenda_id        is distinct from v_faz    then v_muda := array_append(v_muda, 'fazenda_id'); end if;
    if p_campos ? 'plano_conta_id'    and r.plano_conta_id is distinct from v_plano then v_muda := array_append(v_muda, 'plano_conta_id'); end if;
    if p_campos ? 'safra_id'          and r.safra_id       is distinct from v_safra then v_muda := array_append(v_muda, 'safra_id'); end if;
    if p_campos ? 'cultura'           and r.cultura        is distinct from v_cult  then v_muda := array_append(v_muda, 'cultura'); end if;
    if p_campos ? 'fase'              and r.fase           is distinct from v_fase  then v_muda := array_append(v_muda, 'fase'); end if;

    foreach v_k in array v_muda loop
      v_cont := jsonb_set(v_cont, array[v_k], jsonb_build_object(
        'nao_pagas', coalesce((v_cont->v_k->>'nao_pagas')::int, 0) + (not v_paga)::int,
        'pagas',     coalesce((v_cont->v_k->>'pagas')::int, 0) + v_paga::int), true);
    end loop;
    if cardinality(v_muda) > 0 then
      v_alt_tod := v_alt_tod + 1;
      if not v_paga then v_alt_fut := v_alt_fut + 1; end if;
    end if;

    if not coalesce(p_simular, true) and cardinality(v_muda) > 0 and (p_escopo = 'todos' or (p_escopo = 'futuros' and not v_paga)) then
      update public.financeiro_lancamentos_v2 l set
        descricao         = case when 'descricao' = any (v_muda) then v_novo_nome else l.descricao end,
        favorecido_id     = case when 'credor_id' = any (v_muda) then v_credor else l.favorecido_id end,
        forma_pagamento   = case when 'forma_pagamento' = any (v_muda) then v_forma else l.forma_pagamento end,
        conta_bancaria_id = case when 'conta_bancaria_id' = any (v_muda) then v_conta else l.conta_bancaria_id end,
        fazenda_id        = case when 'fazenda_id' = any (v_muda) then v_faz else l.fazenda_id end,
        plano_conta_id    = case when 'plano_conta_id' = any (v_muda) then v_plano else l.plano_conta_id end,
        safra_id          = case when 'safra_id' = any (v_muda) then v_safra else l.safra_id end,
        cultura           = case when 'cultura' = any (v_muda) then v_cult else l.cultura end,
        fase              = case when 'fase' = any (v_muda) then v_fase else l.fase end,
        updated_at = now(), updated_by = coalesce(auth.uid(), l.updated_by)
      where l.id = r.lanc_id;
      v_grav := v_grav + 1;
    end if;
  end loop;

  -- "de → para" de cada campo pedido: o DE e' o que as parcelas tem hoje (um valor, ou "varia entre as parcelas")
  foreach v_k in array c_chaves loop
    continue when not (p_campos ? v_k);
    if v_k = 'descricao' then
      v_de := coalesce(v_moda, f.descricao); v_para := v_desc;
    else
      select count(distinct x.v), min(x.v) into v_dist, v_de from (
        select case v_k
                 when 'credor_id' then (select y.nome from public.financeiro_fornecedores y where y.id = l.favorecido_id)
                 when 'forma_pagamento' then l.forma_pagamento
                 when 'conta_bancaria_id' then (select coalesce(nullif(y.nome_exibicao, ''), y.nome_conta) from public.financeiro_contas_bancarias y where y.id = l.conta_bancaria_id)
                 when 'fazenda_id' then (select y.nome from public.fazendas y where y.id = l.fazenda_id)
                 when 'plano_conta_id' then (select y.subcentro from public.financeiro_plano_contas y where y.id = l.plano_conta_id)
                 when 'safra_id' then (select y.nome from public.financeiro_safras y where y.id = l.safra_id)
                 when 'cultura' then l.cultura
                 when 'fase' then l.fase
               end as v
          from public.financiamento_parcelas q
          join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_id and not coalesce(l.cancelado, false)
         where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado') x;
      if v_dist > 1 then v_de := 'varia entre as parcelas'; end if;
      v_para := case v_k
                  when 'credor_id' then (select y.nome from public.financeiro_fornecedores y where y.id = v_credor)
                  when 'forma_pagamento' then v_forma
                  when 'conta_bancaria_id' then (select coalesce(nullif(y.nome_exibicao, ''), y.nome_conta) from public.financeiro_contas_bancarias y where y.id = v_conta)
                  when 'fazenda_id' then (select y.nome from public.fazendas y where y.id = v_faz)
                  when 'plano_conta_id' then (select y.subcentro from public.financeiro_plano_contas y where y.id = v_plano)
                  when 'safra_id' then (select y.nome from public.financeiro_safras y where y.id = v_safra)
                  when 'cultura' then v_cult
                  when 'fase' then v_fase
                end;
    end if;
    v_campos := v_campos || jsonb_build_object('campo', v_k, 'de', v_de, 'para', v_para,
      'nao_pagas', coalesce((v_cont->v_k->>'nao_pagas')::int, 0), 'pagas', coalesce((v_cont->v_k->>'pagas')::int, 0),
      'nas_pagas', v_k = any (c_das_pagas));
  end loop;

  -- o CONTRATO, na mesma transacao: so' as colunas que ele tem
  if not coalesce(p_simular, true) and p_escopo <> 'nenhum' then
    update public.financiamentos x set
      descricao              = case when p_campos ? 'descricao' then v_desc else x.descricao end,
      credor_id              = case when p_campos ? 'credor_id' then v_credor else x.credor_id end,
      conta_bancaria_id      = case when p_campos ? 'conta_bancaria_id' then v_conta else x.conta_bancaria_id end,
      fazenda_id             = case when p_campos ? 'fazenda_id' then v_faz else x.fazenda_id end,
      plano_conta_parcela_id = case when p_campos ? 'plano_conta_id' then v_plano else x.plano_conta_parcela_id end,
      updated_at = now()
    where x.id = f.id;
  end if;

  return jsonb_build_object(
    'ok', true, 'financiamento_id', f.id, 'escopo', p_escopo, 'simulado', coalesce(p_simular, true),
    'parcelas', jsonb_build_object('nao_pagas', v_np, 'pagas', v_pg),
    'nome_proprio', jsonb_build_object('nao_pagas', v_prop_np, 'pagas', v_prop_pg),
    'campos', v_campos,
    'alteradas', jsonb_build_object('futuros', v_alt_fut, 'todos', v_alt_tod),
    'gravadas', v_grav);
end
$function$;

REVOKE ALL ON FUNCTION public.fn_parcelamento_propagar(uuid, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_parcelamento_propagar(uuid, jsonb, text, boolean) TO authenticated, service_role;
