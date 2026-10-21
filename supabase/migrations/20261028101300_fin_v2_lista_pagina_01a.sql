-- FIN-V2-DESEMPENHO-01a — Lancamentos Financeiros paginados no servidor (so' BANCO; a tela e' o 01b).
--
-- `fn_fin_v2_lista_pagina(p_cliente, p_filtros, p_ordem, p_pagina, p_por_pagina)` devolve UMA pagina da lista e, do recorte
-- INTEIRO, o total de linhas, os totais do topo e as contagens dos segmentos. A semantica e' a da tela de HOJE, filtro a filtro:
-- o que o servidor recorta (`montarPlanoBaseV2`, relacao 'tabela') E o que a tela peneira em memoria (`filteredLancamentos`,
-- `linhasDaGradePorModo`, o residual de "todos os anos + meses"). Cada regra cita a funcao do front que ela espelha.
--
-- p_filtros (jsonb; ausente/nulo = "Todos"), os valores CRUS da tela:
--   fazenda_id, anos [int], meses [int], dimensao ('financeira'|'competencia'|'vencimento'|'pagamento'; padrao financeira),
--   tipo_operacao, status [text] (os do filtro: previsto|programado|agendado|realizado|conciliado_real; 'conciliado' legado),
--   conta_origem, conta_destino, macro, grupo, centro, subcentro, safra (uuid | '__sem_safra__'),
--   cultura (texto | '__sem_cultura__'), atividade (pecuaria|agricultura|silvicultura|administrativo|outros), produto (texto,
--   como digitado), documento (texto), fornecedor_id, modo_sem_caixa ('ocultar'|'mostrar'|'so_dre'; padrao ocultar).
-- p_ordem (jsonb): {campo: default|data|venc|pgto|valor|produto|fornecedor|centro|status|doc|safra, dir: asc|desc,
--   nivel: macro|centro|subcentro (so' para 'centro')}. Desempate SEMPRE o padrao (data da dimensao, competencia, id).
-- p_pagina comeca em 0; p_por_pagina 1..500 (a tela usa 100 | 200).
--
-- ⚠ SECURITY DEFINER com guarda propria (`tenant_ok`, 42501) — a RLS da tabela chamava `is_admin_agroinblue` POR LINHA (medido:
--   ~170 ms das 268 de uma leva de 1.000 do NJ 2026). anon sem EXECUTE.
-- ⚠ plan_cache_mode = force_custom_plan: os filtros ausentes (`v is null or ...`) somem do plano em toda chamada.

-- O numero do documento para comparar — ESPELHO de `normalizarNumeroDoc` (documentoHelper.ts): minusculas, sem acento, so'
-- [a-z0-9], e em cada sequencia de digitos sem os zeros a esquerda ("R_D015" -> "rd15"; "000.000.910" -> "910").
create or replace function public._fn_fin_v2_doc_norm(p text)
returns text language sql stable set search_path = public, pg_temp as $$
  -- (sem o acento circunflexo literal no corpo: o canal de escrita do proto o recusa; chr(94) e' a negacao/ancora)
  select regexp_replace(regexp_replace(lower(public.unaccent(coalesce(p, ''))), '[' || chr(94) || 'a-z0-9]', '', 'g'),
                        '(' || chr(94) || '|\D)0+([0-9])', '\1\2', 'g')
$$;

-- Um candidato casa com o termo ja' decomposto? — ESPELHO do `some` de `documentoCasaComFiltro`.
create or replace function public._fn_fin_v2_doc_casa(p_tipos text[], p_texto text, p_dig text, p_num text,
                                                       p_prefixo text, p_numero text, p_chave text)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select (coalesce(cardinality(p_tipos), 0) = 0 or not exists (select 1 from unnest(p_tipos) t where t is distinct from p_prefixo))
     and (p_texto = ''
          or strpos(public._fn_fin_v2_doc_norm(p_numero), p_texto) > 0
          or (p_num <> '' and strpos(ltrim(regexp_replace(coalesce(p_numero, ''), '\D', '', 'g'), '0'), p_num) > 0)
          or (length(p_dig) >= 4 and strpos(regexp_replace(coalesce(p_chave, ''), '\D', '', 'g'), p_dig) > 0))
$$;

create or replace function public.fn_fin_v2_lista_pagina(
  p_cliente uuid, p_filtros jsonb default '{}'::jsonb, p_ordem jsonb default '{}'::jsonb,
  p_pagina integer default 0, p_por_pagina integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set plan_cache_mode = force_custom_plan
as $fn$
declare
  c_transf constant text[] := array['3-Transferências', '3-Transferência'];
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  o jsonb := coalesce(p_ordem, '{}'::jsonb);
  v_faz uuid; v_dim text; v_tipo text; v_tipo_transf boolean; v_corig uuid; v_cdest uuid; v_foco uuid;
  v_macro text; v_grupo text; v_centro text; v_sub text; v_safra text; v_safra_id uuid; v_cultura text; v_ativ text;
  v_prod text; v_forn uuid; v_modo text;
  v_anos int[]; v_meses int[]; v_faixas daterange[]; v_dmin date; v_dmax date;
  v_status text[]; v_st_banco text[]; v_st_reais text[]; v_tem_conc boolean; v_quer_r boolean; v_quer_c boolean;
  v_doc text; v_doc_ativo boolean := false; v_doc_tipos text[] := '{}'; v_doc_texto text := ''; v_doc_dig text := '';
  v_doc_num text := ''; v_pedacos text[]; v_i int := 1; v_tipo_palavra text;
  v_campo text; v_dir text; v_nivel text; v_pag int; v_por int;
  v_res jsonb;
begin
  if p_cliente is null or not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception 'sem acesso a este cliente' using errcode = '42501';
  end if;

  -- ── filtros ────────────────────────────────────────────────────────────────────────────────────────────────────────
  v_faz    := nullif(f->>'fazenda_id', '')::uuid;
  v_dim    := coalesce(nullif(f->>'dimensao', ''), 'financeira');
  if v_dim not in ('financeira', 'competencia', 'vencimento', 'pagamento') then
    raise exception 'dimensao invalida: %', v_dim using errcode = '22023';
  end if;
  v_modo   := coalesce(nullif(f->>'modo_sem_caixa', ''), 'ocultar');
  if v_modo not in ('ocultar', 'mostrar', 'so_dre') then
    raise exception 'modo_sem_caixa invalido: %', v_modo using errcode = '22023';
  end if;
  v_tipo   := nullif(btrim(coalesce(f->>'tipo_operacao', '')), '');
  v_tipo_transf := v_tipo = any (c_transf);
  v_corig  := nullif(f->>'conta_origem', '')::uuid;
  v_cdest  := nullif(f->>'conta_destino', '')::uuid;
  -- `contaEmFoco`: so' uma das duas contas escolhida e' o ponto de vista
  v_foco   := case when v_cdest is not null and v_corig is null then v_cdest
                   when v_corig is not null and v_cdest is null then v_corig end;
  v_macro  := nullif(f->>'macro', '');
  v_grupo  := nullif(f->>'grupo', '');
  v_centro := nullif(f->>'centro', '');
  v_sub    := nullif(f->>'subcentro', '');
  v_safra  := nullif(f->>'safra', '');
  if v_safra is not null and v_safra <> '__sem_safra__' then v_safra_id := v_safra::uuid; end if;
  v_cultura := nullif(f->>'cultura', '');
  v_ativ   := nullif(f->>'atividade', '');
  -- produto: a tela so' filtra com texto nao vazio, e compara o termo COMO DIGITADO (`descricao.toLowerCase().includes(q)`)
  v_prod   := case when btrim(coalesce(f->>'produto', '')) <> '' then f->>'produto' end;
  v_forn   := nullif(f->>'fornecedor_id', '')::uuid;

  select coalesce(array_agg(distinct x::int), '{}') into v_anos
    from jsonb_array_elements_text(coalesce(f->'anos', '[]')) x where x similar to '[0-9]+' and x::int > 0;
  select coalesce(array_agg(distinct x::int), '{}') into v_meses
    from jsonb_array_elements_text(coalesce(f->'meses', '[]')) x where x similar to '[0-9]+' and x::int between 1 and 12;
  -- `montarPlanoBaseV2`: anos inteiros, ou o produto cartesiano anos x meses; [ini, fim)
  if cardinality(v_anos) > 0 then
    if cardinality(v_meses) > 0 then
      select array_agg(daterange(make_date(a, m, 1), (make_date(a, m, 1) + interval '1 month')::date, '[)'))
        into v_faixas from unnest(v_anos) a, unnest(v_meses) m;
    else
      select array_agg(daterange(make_date(a, 1, 1), make_date(a + 1, 1, 1), '[)')) into v_faixas from unnest(v_anos) a;
    end if;
    select min(lower(r)), max(upper(r)) into v_dmin, v_dmax from unnest(v_faixas) r;
  end if;

  -- status: `conciliado_real` NAO existe no banco — vai como 'realizado' e o recorte fino e' pelo vinculo (LANC-STATUS-LISTA-UNICA-01)
  select coalesce(array_agg(x), '{}') into v_status from jsonb_array_elements_text(coalesce(f->'status', '[]')) x;
  select coalesce(array_agg(distinct case when x = 'conciliado_real' then 'realizado' else x end), '{}') into v_st_banco from unnest(v_status) x;
  v_tem_conc := 'conciliado' = any (v_st_banco);
  v_st_reais := array_remove(v_st_banco, 'conciliado');
  v_quer_r := 'realizado' = any (v_status);
  v_quer_c := 'conciliado_real' = any (v_status);

  -- documento: o termo decomposto como em `documentoCasaComFiltro` (as palavras de TIPO no comeco; o resto e' o texto)
  v_doc := btrim(coalesce(f->>'documento', ''));
  if v_doc <> '' then
    v_doc_ativo := true;
    select coalesce(array_agg(x order by n), '{}') into v_pedacos
      from regexp_split_to_table(regexp_replace(lower(public.unaccent(v_doc)), '\mnf-e\M', 'nfe', 'g'), '[' || chr(94) || 'a-z0-9]+') with ordinality t(x, n)
     where x <> '';
    while v_i <= coalesce(cardinality(v_pedacos), 0) loop
      v_tipo_palavra := case v_pedacos[v_i]
        when 'nf' then 'NF' when 'nfe' then 'NF' when 'nota' then 'NF' when 'fiscal' then 'NF'
        when 'rec' then 'Rec.' when 'recibo' then 'Rec.' when 'bol' then 'Bol.' when 'boleto' then 'Bol.' when 'fatura' then 'Bol.'
        when 'comp' then 'Comp.' when 'comprovante' then 'Comp.' end;
      exit when v_tipo_palavra is null;
      v_doc_tipos := v_doc_tipos || v_tipo_palavra;
      v_i := v_i + 1;
    end loop;
    v_doc_texto := public._fn_fin_v2_doc_norm(array_to_string(v_pedacos[v_i:], ''));
    v_doc_dig := case when v_doc_texto similar to '[0-9]+' then array_to_string(v_pedacos[v_i:], '') else '' end;
    v_doc_num := ltrim(v_doc_dig, '0');
  end if;

  -- ── ordem e pagina ─────────────────────────────────────────────────────────────────────────────────────────────────
  v_campo := coalesce(nullif(o->>'campo', ''), 'default');
  if v_campo not in ('default', 'data', 'venc', 'pgto', 'valor', 'produto', 'fornecedor', 'centro', 'status', 'doc', 'safra') then
    raise exception 'ordem invalida: %', v_campo using errcode = '22023';
  end if;
  v_dir := case when o->>'dir' = 'desc' then 'desc' else 'asc' end;
  v_nivel := coalesce(nullif(o->>'nivel', ''), 'centro');
  if v_nivel not in ('macro', 'centro', 'subcentro') then raise exception 'nivel invalido: %', v_nivel using errcode = '22023'; end if;
  v_pag := greatest(coalesce(p_pagina, 0), 0);
  v_por := coalesce(p_por_pagina, 100);
  if v_por < 1 or v_por > 500 then raise exception 'por_pagina fora de 1..500: %', v_por using errcode = '22023'; end if;

  with conc as (   -- `useLancamentosConciliados`: vinculo vivo com extrato do cliente
    select distinct ci.lancamento_id
      from public.conciliacao_bancaria_itens ci
      join public.extrato_bancario_v2 e on e.id = ci.extrato_id
     where ci.desfeito_em is null and e.cliente_id = p_cliente and ci.lancamento_id is not null
  ),
  docs as (        -- `useDocumentosDoCliente` + `documentoCasaComFiltro`: os documentos VIVOS ligados que casam
    select distinct d.lancamento_id
      from public.vw_lancamento_documentos d
     where v_doc_ativo and d.cliente_id = p_cliente and d.lancamento_id is not null and d.cancelado is not true
       and public._fn_fin_v2_doc_casa(v_doc_tipos, v_doc_texto, v_doc_dig, v_doc_num,
             case d.especie when 'nf' then 'NF' when 'nf_principal' then 'NF' when 'nf_complementar' then 'NF' when 'nf_produtor' then 'NF'
                            when 'recibo' then 'Rec.' when 'boleto' then 'Bol.' when 'comprovante' then 'Comp.' else '' end,
             d.numero, d.chave_acesso)
  ),
  base as (
    select l.id, l.valor, l.sinal, l.tipo_operacao, l.conta_bancaria_id, l.conta_destino_id, l.status_transacao,
           (l.sem_movimentacao_caixa is true) as sem_caixa, (l.compoe_dre is true) as compoe_dre,
           (c.lancamento_id is not null) as conciliado, (l.conciliado_em is not null) as tem_conciliado_em,
           case v_dim when 'competencia' then l.data_competencia when 'vencimento' then l.data_vencimento
                      when 'pagamento' then l.data_pagamento else coalesce(l.data_pagamento, l.data_vencimento) end as d,
           l.data_competencia, l.data_vencimento, l.data_pagamento, l.descricao, l.numero_documento, l.favorecido_id, l.safra_id,
           l.macro_custo, l.centro_custo, l.subcentro
      from public.financeiro_lancamentos_v2 l
      left join conc c on c.lancamento_id = l.id
     where l.cliente_id = p_cliente
       -- estruturais do caminho de hoje (`.eq/.neq` do PostgREST: nulo fica fora)
       and l.cancelado = false and l.status_transacao <> 'conciliado' and l.cenario <> 'meta'
       and (v_faz is null or l.fazenda_id = v_faz)
       -- limites de faixa, para o indice; o recorte exato vem logo abaixo
       and (v_dmin is null
            or (v_dim = 'financeira'  and coalesce(l.data_pagamento, l.data_vencimento) >= v_dmin and coalesce(l.data_pagamento, l.data_vencimento) < v_dmax)
            or (v_dim = 'competencia' and l.data_competencia >= v_dmin and l.data_competencia < v_dmax)
            or (v_dim = 'vencimento'  and l.data_vencimento  >= v_dmin and l.data_vencimento  < v_dmax)
            or (v_dim = 'pagamento'   and l.data_pagamento   >= v_dmin and l.data_pagamento   < v_dmax))
       -- contas (`montarPlanoBaseV2`): as duas = transferencia entre elas (so' a grafia oficial, como o `.eq` do plano)
       and (case when v_corig is not null and v_cdest is not null then
                   l.tipo_operacao = '3-Transferências' and l.conta_bancaria_id = v_corig and l.conta_destino_id = v_cdest
                 else (v_corig is null or l.conta_bancaria_id = v_corig) and (v_cdest is null or l.conta_destino_id = v_cdest)
                      and (v_tipo is null or (case when v_tipo_transf then l.tipo_operacao = any (c_transf) else l.tipo_operacao = v_tipo end))
            end)
       -- tipo em memoria (`casaTipoOperacao`): vale tambem com as duas contas
       and (v_tipo is null or (case when v_tipo_transf then btrim(coalesce(l.tipo_operacao, '')) = any (c_transf)
                                    else btrim(coalesce(l.tipo_operacao, '')) = v_tipo end))
       -- direcao em memoria (`filteredLancamentos`): so' origem = saidas e transferencias; so' destino = entradas e transferencias
       and (not (v_corig is not null and v_cdest is null)
            or (case when l.sinal similar to '-?[0-9]+' then l.sinal::int else 0 end) < 0 or btrim(coalesce(l.tipo_operacao, '')) = any (c_transf))
       and (not (v_cdest is not null and v_corig is null)
            or (case when l.sinal similar to '-?[0-9]+' then l.sinal::int else 0 end) > 0 or btrim(coalesce(l.tipo_operacao, '')) = any (c_transf))
       and (v_macro  is null or l.macro_custo  = v_macro)
       and (v_grupo  is null or l.grupo_custo  = v_grupo)
       and (v_centro is null or l.centro_custo = v_centro)
       and (v_sub    is null or l.subcentro    = v_sub)
       and (v_safra is null or (case when v_safra = '__sem_safra__' then l.safra_id is null else l.safra_id = v_safra_id end))
       and (v_cultura is null or (case when v_cultura = '__sem_cultura__' then coalesce(l.cultura, '') = '' else l.cultura = v_cultura end))
       and (v_forn is null or l.favorecido_id = v_forn)
       and (v_prod is null or strpos(lower(coalesce(l.descricao, '')), lower(v_prod)) > 0)
       -- atividade (`normalizarAtividade`)
       and (v_ativ is null or v_ativ = case
              when lower(btrim(coalesce(l.escopo_negocio, ''))) in ('pecuaria', 'pecuária') then 'pecuaria'
              when lower(btrim(coalesce(l.escopo_negocio, ''))) in ('agricultura', 'agri') then 'agricultura'
              when lower(btrim(coalesce(l.escopo_negocio, ''))) = 'silvicultura' then 'silvicultura'
              when lower(btrim(coalesce(l.escopo_negocio, ''))) = 'administrativo' then 'administrativo'
              else 'outros' end)
       -- documento: o numero proprio (com o prefixo do tipo) OU um documento vivo ligado
       and (not v_doc_ativo
            or (btrim(coalesce(l.numero_documento, '')) <> '' and public._fn_fin_v2_doc_casa(v_doc_tipos, v_doc_texto, v_doc_dig, v_doc_num,
                  case l.tipo_documento when 'Nota Fiscal' then 'NF' when 'Recibo' then 'Rec.' when 'Fatura' then 'Bol.'
                                        when 'Boleto' then 'Bol.' when 'Comprovante' then 'Comp.' else '' end,
                  l.numero_documento, null))
            or l.id in (select dc.lancamento_id from docs dc))
  ),
  temporal as (    -- o recorte exato da dimensao (faixas; "mes em qualquer ano" = o residual da tela; sem nada = data nao nula)
    select b.* from base b
     where case when cardinality(v_anos) > 0 then exists (select 1 from unnest(v_faixas) r where b.d <@ r)
                when cardinality(v_meses) > 0 then b.d is not null and extract(month from b.d)::int = any (v_meses)
                else b.d is not null end
  ),
  marcado as (
    select t.*,
      -- status: o do banco (`montarPlanoBaseV2`) e a particao realizado x conciliado pelo vinculo (`filteredLancamentos`)
      ((cardinality(v_st_banco) = 0
        or (case when v_tem_conc then (cardinality(v_st_reais) > 0 and t.status_transacao = any (v_st_reais))
                                       or t.tem_conciliado_em
                 else t.status_transacao = any (v_st_banco) end))
       and (v_quer_r = v_quer_c or lower(coalesce(t.status_transacao, '')) <> 'realizado' or t.conciliado = v_quer_c)) as st_ok,
      -- `linhasDaGradePorModo`
      (case when v_modo = 'so_dre' then t.sem_caixa and t.compoe_dre else not t.sem_caixa end) as na_grade,
      -- `sentidoNaConta`
      case when v_foco is not null and t.conta_destino_id = v_foco and t.conta_bancaria_id is distinct from v_foco then 'entrada'
           when v_foco is not null and btrim(coalesce(t.tipo_operacao, '')) = any (c_transf) then 'saida'
           when btrim(coalesce(t.tipo_operacao, '')) = any (c_transf) then 'transferencia'
           when coalesce(t.tipo_operacao, '') like '1%' then 'entrada' else 'saida' end as sentido
    from temporal t
  ),
  grade as (select m.* from marcado m where m.st_ok and m.na_grade),
  ordenada as (
    select g.id, row_number() over (order by
        case when v_campo = 'safra' then (sf.cod is null)::int end,
        case when v_dir = 'asc' then
          case v_campo when 'venc' then coalesce(g.data_vencimento::text, '') when 'pgto' then coalesce(g.data_pagamento::text, '')
                       when 'produto' then coalesce(g.descricao, '') when 'fornecedor' then coalesce(fo.nome, '')
                       when 'status' then coalesce(g.status_transacao, '') when 'doc' then coalesce(g.numero_documento, '')
                       when 'safra' then sf.cod
                       when 'centro' then coalesce(nullif(btrim(case v_nivel when 'macro' then g.macro_custo when 'subcentro' then g.subcentro
                                                                    else g.centro_custo end), ''), '-') end end collate "pt-BR-x-icu" asc,
        case when v_dir = 'desc' then
          case v_campo when 'venc' then coalesce(g.data_vencimento::text, '') when 'pgto' then coalesce(g.data_pagamento::text, '')
                       when 'produto' then coalesce(g.descricao, '') when 'fornecedor' then coalesce(fo.nome, '')
                       when 'status' then coalesce(g.status_transacao, '') when 'doc' then coalesce(g.numero_documento, '')
                       when 'safra' then sf.cod
                       when 'centro' then coalesce(nullif(btrim(case v_nivel when 'macro' then g.macro_custo when 'subcentro' then g.subcentro
                                                                    else g.centro_custo end), ''), '-') end end collate "pt-BR-x-icu" desc,
        case when v_dir = 'asc' then case v_campo when 'valor' then g.valor * (case when g.sinal similar to '-?[0-9]+' then g.sinal::int else 0 end)
                                                  when 'data' then extract(epoch from g.data_competencia) end end asc nulls first,
        case when v_dir = 'desc' then case v_campo when 'valor' then g.valor * (case when g.sinal similar to '-?[0-9]+' then g.sinal::int else 0 end)
                                                   when 'data' then extract(epoch from g.data_competencia) end end desc nulls last,
        -- `compareDefaultOrder`: data da dimensao (sem ela, ao fim), competencia, id
        coalesce(g.d, date '9999-12-31'), g.data_competencia nulls first, g.id::text collate "C") as pos
      from grade g
      left join public.financeiro_fornecedores fo on v_campo = 'fornecedor' and fo.id = g.favorecido_id
      left join lateral (select nullif(coalesce(nullif(s.codigo, ''), s.nome), '') as cod from public.financeiro_safras s
                          where v_campo = 'safra' and s.id = g.safra_id and s.cliente_id = p_cliente and s.ativa) sf on true
  )
  select jsonb_build_object(
    'versao', 'fin-v2-lista-01a',
    'pagina', v_pag, 'por_pagina', v_por,
    'total_linhas', (select count(*) from grade),
    'linhas', coalesce((
        select jsonb_agg(to_jsonb(l) || jsonb_build_object('conciliado', g.conciliado) order by od.pos)
          from ordenada od join grade g on g.id = od.id join public.financeiro_lancamentos_v2 l on l.id = od.id
         where od.pos > v_pag * v_por and od.pos <= (v_pag + 1) * v_por), '[]'::jsonb),
    -- `totaisDaListaV2` sobre a grade, com o foco da conta
    'totais', (select jsonb_build_object(
        'entradas',           round(coalesce(sum(abs(g.valor)) filter (where g.sentido = 'entrada' and not g.sem_caixa), 0), 2),
        'saidas',             round(coalesce(sum(abs(g.valor)) filter (where g.sentido = 'saida' and not g.sem_caixa), 0), 2),
        'transferencias',     round(coalesce(sum(abs(g.valor)) filter (where g.sentido = 'transferencia'), 0), 2),
        'entradas_sem_caixa', round(coalesce(sum(abs(g.valor)) filter (where g.sentido = 'entrada' and g.sem_caixa), 0), 2),
        'saidas_sem_caixa',   round(coalesce(sum(abs(g.valor)) filter (where g.sentido = 'saida' and g.sem_caixa), 0), 2)) from grade g),
    -- a secao "sem caixa" do Mostrar (`semCaixaLocal` + `totalSemCaixa`): o sem caixa do recorte filtrado
    'sem_caixa', (select jsonb_build_object('linhas', count(*),
        'total', round(coalesce(sum(case when (case when m.sinal similar to '-?[0-9]+' then m.sinal::int else 0 end) < 0 then -abs(m.valor) else abs(m.valor) end), 0), 2))
        from marcado m where m.st_ok and m.sem_caixa),
    -- os segmentos: quantos em cada posicao do "sem caixa" (com o status escolhido) e em cada status (no modo escolhido)
    'contagens', jsonb_build_object(
      'modo', (select jsonb_build_object('caixa', count(*) filter (where not m.sem_caixa),
                                         'sem_caixa', count(*) filter (where m.sem_caixa),
                                         'so_dre', count(*) filter (where m.sem_caixa and m.compoe_dre)) from marcado m where m.st_ok),
      'status', (select jsonb_build_object(
          'previsto',        count(*) filter (where m.status_transacao = 'previsto'),
          'programado',      count(*) filter (where m.status_transacao = 'programado'),
          'agendado',        count(*) filter (where m.status_transacao = 'agendado'),
          'realizado',       count(*) filter (where m.status_transacao = 'realizado' and not m.conciliado),
          'conciliado_real', count(*) filter (where m.status_transacao = 'realizado' and m.conciliado),
          'outros',          count(*) filter (where m.status_transacao not in ('previsto', 'programado', 'agendado', 'realizado')))
        from marcado m where m.na_grade))
  ) into v_res;

  return v_res;
end
$fn$;

revoke all on function public._fn_fin_v2_doc_norm(text) from public, anon, authenticated;
revoke all on function public._fn_fin_v2_doc_casa(text[], text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.fn_fin_v2_lista_pagina(uuid, jsonb, jsonb, integer, integer) from public, anon;
grant execute on function public.fn_fin_v2_lista_pagina(uuid, jsonb, jsonb, integer, integer) to authenticated, service_role;

comment on function public.fn_fin_v2_lista_pagina(uuid, jsonb, jsonb, integer, integer) is
  'FIN-V2-DESEMPENHO-01a — uma pagina da lista de Lancamentos Financeiros + total, totais e contagens do recorte inteiro, com a semantica da tela de hoje (plano do servidor + filtros de memoria).';
