-- PATR-VALOR-MERCADO-NJ-01 · 116160 — a avaliação de mercado ganha CONFIANÇA, FONTES (URLs), CRITÉRIO e LOTE; e o lote oficial.
-- Valor de mercado é uma AVALIAÇÃO COM DATA (`patrimonio_avaliacoes`, 116050): nunca toca aquisição, depreciação nem o contábil.
-- Histórico: avaliação nova não apaga a anterior; a vigente é a de data mais recente (a regra de sempre da `fn_patrimonio_lista`).
--   confianca  'alta' | 'media' | 'baixa' (nula nas avaliações antigas: a tela não mostra selo)
--   fontes     as URLs consultadas (text[]; cada uma http/https)
--   criterio   como o valor saiu ("usado mesmo ano", "FIPE", "estimativa genérica"…) — o `base` segue sendo bem/terra
--   lote       a etiqueta do lote ("pesquisa de mercado 03/11/2026"): a trilha e a trava contra gravar o mesmo lote duas vezes
-- Autor = `criado_por` (auth.uid()), como sempre.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 0. Guarda: o corpo da RPC de uma avaliação é o do 116060 (o patch abaixo parte dele) ----------------------------------------
do $g$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fn_patrimonio_avaliacao_salvar(uuid,jsonb,boolean)'::regprocedure)
     <> '9c4ab544624bca4115591f930bd01839' then
    raise exception 'fn_patrimonio_avaliacao_salvar mudou desde o 116060: refazer o patch';
  end if;
end $g$;

-- 1. Colunas ------------------------------------------------------------------------------------------------------------------
alter table public.patrimonio_avaliacoes
  add column if not exists confianca text check (confianca in ('alta', 'media', 'baixa')),
  add column if not exists fontes text[] not null default '{}',
  add column if not exists criterio text,
  add column if not exists lote text;
create index if not exists patrimonio_avaliacoes_lote_idx on public.patrimonio_avaliacoes (cliente_id, lote) where lote is not null and cancelado_em is null;

-- validação comum dos campos novos (interna)
create or replace function public._fn_patrimonio_avaliacao_extras(p jsonb)
returns jsonb
language plpgsql immutable set search_path = pg_catalog, public
as $$
declare v_conf text := nullif(btrim(coalesce(p->>'confianca', '')), ''); v_fontes text[] := '{}'; f text;
begin
  if v_conf is not null and v_conf not in ('alta', 'media', 'baixa') then
    raise exception using errcode = 'P0001', message = 'Confiança: alta, média ou baixa.';
  end if;
  if jsonb_typeof(p->'fontes') = 'array' then
    for f in select btrim(x) from jsonb_array_elements_text(p->'fontes') x loop
      if f = '' then continue; end if;
      if f !~* '^https?://' then raise exception using errcode = 'P0001', message = format('Fonte não é um endereço: %s', left(f, 60)); end if;
      v_fontes := v_fontes || f;
    end loop;
  end if;
  return jsonb_build_object('confianca', v_conf, 'fontes', to_jsonb(v_fontes),
    'criterio', nullif(btrim(coalesce(p->>'criterio', '')), ''));
end $$;
revoke all on function public._fn_patrimonio_avaliacao_extras(jsonb) from public, anon, authenticated;
grant execute on function public._fn_patrimonio_avaliacao_extras(jsonb) to service_role;

-- 2. A RPC de UMA avaliação (a da aba Valor de mercado): o corpo do 116060 + os campos novos -----------------------------------
create or replace function public.fn_patrimonio_avaliacao_salvar(p_bem uuid, p_avaliacao jsonb, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  b public.patrimonio_bens%rowtype := public._fn_patrimonio_bem_do_usuario(p_bem);
  c public.patrimonio_categorias%rowtype;
  v_data date := nullif(p_avaliacao->>'data', '')::date;
  v_fonte text := nullif(btrim(coalesce(p_avaliacao->>'fonte', '')), '');
  v_base text := nullif(p_avaliacao->>'base', '');
  v_ha numeric := nullif(p_avaliacao->>'valor_ha', '')::numeric;
  v_area numeric := nullif(p_avaliacao->>'area_ha', '')::numeric;
  v_total numeric := nullif(p_avaliacao->>'valor_total', '')::numeric;
  v_id uuid;
  v_x jsonb := public._fn_patrimonio_avaliacao_extras(p_avaliacao);
begin
  select * into c from public.patrimonio_categorias x where x.id = b.categoria_id;
  if not c.tem_mercado then raise exception using errcode = 'P0001', message = 'Esta categoria não tem valor de mercado próprio.'; end if;
  if v_data is null or v_data > public._fn_patrimonio_hoje() then
    raise exception using errcode = 'P0001', message = 'Informe a data da avaliação (até hoje).';
  end if;
  if v_fonte is null then raise exception using errcode = 'P0001', message = 'Informe a fonte da avaliação.'; end if;
  if c.base_mercado = 'terra' then
    if v_base is null or v_base not in ('terra_nua', 'terra_formada') then
      raise exception using errcode = 'P0001', message = 'Diga a base da avaliação: terra nua (VTN do ITR) ou terra formada (laudo).';
    end if;
    v_area := coalesce(v_area, b.area_ha);
    if coalesce(v_ha, 0) <= 0 or coalesce(v_area, 0) <= 0 then
      raise exception using errcode = 'P0001', message = 'Informe o R$/ha e a área da avaliação.';
    end if;
    v_total := round(v_ha * v_area, 2);
  else
    v_base := 'bem'; v_ha := null; v_area := null;
    if coalesce(v_total, 0) <= 0 then raise exception using errcode = 'P0001', message = 'Informe o valor de mercado.'; end if;
  end if;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'base', v_base, 'valor_ha', v_ha, 'area_ha', v_area, 'valor_total', v_total);
  end if;
  insert into public.patrimonio_avaliacoes (cliente_id, bem_id, data, fonte, base, valor_ha, area_ha, valor_total, observacao, criado_por,
                                            confianca, fontes, criterio)
  values (b.cliente_id, b.id, v_data, v_fonte, v_base, v_ha, v_area, v_total,
          nullif(btrim(coalesce(p_avaliacao->>'observacao', '')), ''), auth.uid(),
          v_x->>'confianca', array(select jsonb_array_elements_text(v_x->'fontes')), v_x->>'criterio')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'simulado', false, 'id', v_id, 'valor_total', v_total);
end $$;

-- 3. O LOTE: tudo ou nada, casado pelo Nº próprio do cliente --------------------------------------------------------------------
-- p_itens: [{ numero_proprio, data, valor_total, fonte, criterio, confianca, fontes: [url…], observacao }]
-- Prévia (p_simular = true): as linhas como vão entrar, o mercado de hoje de cada bem, os totais por categoria e as RECUSAS
-- (nada se grava). Gravar com qualquer recusa = nada gravado (a mesma lista vai na mensagem).
create or replace function public.fn_patrimonio_avaliacoes_lote(p_cliente uuid, p_itens jsonb, p_lote text, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  it jsonb; v_x jsonb; b public.patrimonio_bens%rowtype; c public.patrimonio_categorias%rowtype;
  v_np text; v_data date; v_total numeric; v_fonte text; v_n int;
  v_lote text := nullif(btrim(coalesce(p_lote, '')), '');
  v_linhas jsonb := '[]'::jsonb; v_erros text[] := '{}'; v_vistos text[] := '{}';
  v_hoje date := public._fn_patrimonio_hoje();
  v_atual record;
begin
  if p_cliente is null or not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if v_lote is null then raise exception using errcode = 'P0001', message = 'Diga o lote (ex.: "pesquisa de mercado 03/11/2026").'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception using errcode = 'P0001', message = 'Lote vazio.';
  end if;
  if exists (select 1 from public.patrimonio_avaliacoes a where a.cliente_id = p_cliente and a.lote = v_lote and a.cancelado_em is null) then
    raise exception using errcode = 'P0001', message = format('O lote "%s" já foi gravado neste cliente.', v_lote);
  end if;

  for it in select * from jsonb_array_elements(p_itens) loop
    v_np := nullif(btrim(coalesce(it->>'numero_proprio', '')), '');
    v_data := nullif(it->>'data', '')::date;
    v_total := nullif(it->>'valor_total', '')::numeric;
    v_fonte := nullif(btrim(coalesce(it->>'fonte', '')), '');
    b := null; c := null;
    if v_np is null then v_erros := v_erros || 'linha sem Nº próprio'; continue; end if;
    if v_np = any (v_vistos) then v_erros := v_erros || format('%s aparece duas vezes', v_np); continue; end if;
    v_vistos := v_vistos || v_np;
    select count(*) into v_n from public.patrimonio_bens x where x.cliente_id = p_cliente and x.numero_proprio = v_np;
    if v_n <> 1 then v_erros := v_erros || format('%s: %s bens com este Nº próprio', v_np, v_n); continue; end if;
    select * into b from public.patrimonio_bens x where x.cliente_id = p_cliente and x.numero_proprio = v_np;
    select * into c from public.patrimonio_categorias x where x.id = b.categoria_id;
    if not c.tem_mercado then v_erros := v_erros || format('%s: %s não tem valor de mercado', v_np, c.nome); continue; end if;
    if c.base_mercado <> 'bem' then v_erros := v_erros || format('%s: terra não entra por lote', v_np); continue; end if;
    if v_data is null or v_data > v_hoje then v_erros := v_erros || format('%s: data inválida', v_np); continue; end if;
    if coalesce(v_total, 0) <= 0 then v_erros := v_erros || format('%s: valor inválido', v_np); continue; end if;
    if v_fonte is null then v_erros := v_erros || format('%s: sem fonte', v_np); continue; end if;
    begin
      v_x := public._fn_patrimonio_avaliacao_extras(it);
    exception when sqlstate 'P0001' then v_erros := v_erros || format('%s: %s', v_np, sqlerrm); continue;
    end;
    select a.valor_total, a.data into v_atual from public.patrimonio_avaliacoes a
     where a.bem_id = b.id and a.cancelado_em is null order by a.data desc, a.criado_em desc limit 1;
    v_linhas := v_linhas || jsonb_build_object('numero_proprio', v_np, 'codigo', b.codigo, 'descricao', b.descricao, 'categoria', c.nome,
      'data', v_data, 'valor_total', v_total, 'confianca', v_x->>'confianca', 'criterio', v_x->>'criterio',
      'n_fontes', jsonb_array_length(v_x->'fontes'), 'mercado_antes', v_atual.valor_total, 'mercado_antes_data', v_atual.data);
    if not p_simular then
      insert into public.patrimonio_avaliacoes (cliente_id, bem_id, data, fonte, base, valor_total, observacao, criado_por,
                                                confianca, fontes, criterio, lote)
      values (b.cliente_id, b.id, v_data, v_fonte, 'bem', v_total, nullif(btrim(coalesce(it->>'observacao', '')), ''), auth.uid(),
              v_x->>'confianca', array(select jsonb_array_elements_text(v_x->'fontes')), v_x->>'criterio', v_lote);
    end if;
  end loop;

  if cardinality(v_erros) > 0 and not p_simular then
    raise exception using errcode = 'P0001',
      message = format('Nada gravado: %s recusa(s) — %s', cardinality(v_erros), array_to_string(v_erros[1:10], '; '));
  end if;
  return jsonb_build_object('ok', cardinality(v_erros) = 0, 'simulado', p_simular, 'lote', v_lote,
    'n', jsonb_array_length(v_linhas), 'total', (select coalesce(sum((l->>'valor_total')::numeric), 0) from jsonb_array_elements(v_linhas) l),
    'por_categoria', (select coalesce(jsonb_object_agg(cat, tot), '{}'::jsonb) from (
        select l->>'categoria' cat, sum((l->>'valor_total')::numeric) tot from jsonb_array_elements(v_linhas) l group by 1) s),
    'recusas', to_jsonb(v_erros), 'linhas', v_linhas);
end $$;

revoke all on function public.fn_patrimonio_avaliacoes_lote(uuid, jsonb, text, boolean) from public, anon;
grant execute on function public.fn_patrimonio_avaliacoes_lote(uuid, jsonb, text, boolean) to authenticated, service_role;
