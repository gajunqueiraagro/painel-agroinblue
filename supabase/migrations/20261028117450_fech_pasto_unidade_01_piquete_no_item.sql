-- FECH-PASTO-UNIDADE-01 · F1 banco 1/4 (Gabriel 07/11/2026 14:02 e 14:11, modelo A): "piquete não é pasto, é apenas uma subárea dentro do pasto".
-- O CARD é do pasto (o pai da divisão); o piquete é um campo OPCIONAL na linha do card (`fechamento_pasto_itens.piquete_id`, nulo = o pasto
-- inteiro). Quem é piquete NÃO ganha coluna nova: é o pasto de um grupo ATIVO que nasceu de outro (`pasto_grupos.pasto_origem_id`, o mapa
-- já lia assim) — `_fn_pai_do_piquete`. Grupo montado à mão (sem origem) segue sendo de pastos.
--   1) `_fn_pai_do_piquete(pasto)`;
--   2) a linha do card ganha `piquete_id`; a unicidade passa de (card, categoria) a (card, categoria, piquete) com NULLS NOT DISTINCT
--      (a mesma categoria em 2 piquetes; sem piquete, uma linha só, como hoje);
--   3) gatilho da linha: o piquete é do pasto do card e vale no mês do card;
--   4) gatilho do card: card de piquete não nasce mais (nem muda para um) — o lançamento é no card do pasto;
--   5) a área do mês do pasto dividido = a soma dos piquetes vigentes no mês (`fn_pasto_area_no_mes`; a lotação e o mapa a leem);
--   6) o gravador do card aceita linhas com e sem `piquete_id` no mesmo card;
--   7) `fn_fechamento_pasto_inteiro(card, simular)`: volta o card a "pasto inteiro" — soma as linhas de cada categoria, zera o piquete,
--      nenhuma cabeça se perde (peso médio ponderado), com trilha;
--   8) P1, conjunto do mês e pendências contam só pastos (remendo por md5).
-- A divisão que não encerra mais o pai é a 117460; a migração dos dados gravados, a 117470.
set local lock_timeout = '2s';

-- o remendo de corpo grande/de outra frente: confere o md5 do corpo VIVO, cada trecho casa 1 vez, recria pelo pg_get_functiondef
-- (dono, SECURITY, search_path e as permissões ficam como estão: CREATE OR REPLACE não mexe no ACL)
create or replace function pg_temp.fpu_patch(p_fn regprocedure, p_md5 text, p_de text[], p_para text[]) returns text language plpgsql as $f$
declare v_src text; v_def text; i int; n int;
begin
  select prosrc into v_src from pg_proc where oid = p_fn;
  if md5(v_src) <> p_md5 then
    raise exception 'FECH-PASTO-UNIDADE-01: o corpo de % mudou (md5 %, esperado %). Nada foi gravado.', p_fn, md5(v_src), p_md5;
  end if;
  v_def := pg_get_functiondef(p_fn);
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(v_def) - length(replace(v_def, p_de[i], ''))) / length(p_de[i]);
    if n <> 1 then
      raise exception 'FECH-PASTO-UNIDADE-01: o trecho % de % aparece % vez(es), esperado 1. Nada foi gravado.', i, p_fn, n;
    end if;
    v_def := replace(v_def, p_de[i], p_para[i]);
  end loop;
  execute v_def;
  select prosrc into v_src from pg_proc where oid = p_fn;
  return md5(v_src);
end $f$;

-- 1) quem é piquete --------------------------------------------------------------------------------------------------------------------
create or replace function public._fn_pai_do_piquete(p_pasto uuid)
returns uuid language sql stable security invoker set search_path to 'pg_catalog', 'public' as $$
  select g.pasto_origem_id from public.pastos p join public.pasto_grupos g on g.id = p.grupo_id
   where p.id = p_pasto and g.ativo and g.pasto_origem_id is not null and g.pasto_origem_id <> p.id
$$;
revoke all on function public._fn_pai_do_piquete(uuid) from public, anon;
grant execute on function public._fn_pai_do_piquete(uuid) to authenticated, service_role;

-- 2) o piquete na linha do card --------------------------------------------------------------------------------------------------------
alter table public.fechamento_pasto_itens add column piquete_id uuid references public.pastos(id);
comment on column public.fechamento_pasto_itens.piquete_id is
  'FECH-PASTO-UNIDADE-01: o piquete (subárea do pasto do card) desta linha; nulo = o pasto inteiro. Só piquete do pasto do card, vigente no mês.';
create unique index fechamento_pasto_itens_card_categoria_piquete
  on public.fechamento_pasto_itens (fechamento_id, categoria_id, piquete_id) nulls not distinct;
alter table public.fechamento_pasto_itens drop constraint fechamento_pasto_itens_fechamento_pasto_id_categoria_id_key;
create index fechamento_pasto_itens_piquete on public.fechamento_pasto_itens (piquete_id) where piquete_id is not null;

-- 3) a linha: o piquete é do pasto do card e vale no mês -------------------------------------------------------------------------------
create or replace function public._fn_item_piquete_ok()
returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare v_card public.fechamento_pastos%rowtype; v_piq public.pastos%rowtype;
begin
  if new.piquete_id is null then return new; end if;
  select * into v_card from public.fechamento_pastos where id = new.fechamento_id;
  select * into v_piq from public.pastos where id = new.piquete_id;
  if v_piq.id is null or public._fn_pai_do_piquete(v_piq.id) is distinct from v_card.pasto_id then
    raise exception using errcode = 'P0001',
      message = format('%s não é piquete deste pasto. Escolha de novo. Nada foi gravado.', coalesce(v_piq.nome, 'O piquete escolhido'));
  end if;
  if not public.fn_pasto_vigente_no_mes(v_piq.ativo, v_piq.data_inicio, v_piq.data_fim, v_card.ano_mes) then
    raise exception using errcode = 'P0001',
      message = format('O piquete %s não vale em %s. Nada foi gravado.', v_piq.nome, to_char(to_date(v_card.ano_mes, 'YYYY-MM'), 'MM/YYYY'));
  end if;
  return new;
end $$;
revoke all on function public._fn_item_piquete_ok() from public, anon, authenticated;
create trigger trg_item_piquete_ok before insert or update of piquete_id, fechamento_id on public.fechamento_pasto_itens
  for each row execute function public._fn_item_piquete_ok();

-- 4) o card: nunca de piquete (o desfazer da 117470 é o único que volta um card ao piquete, com `app.pasto_unidade_desfazer`) -------------
create or replace function public._fn_card_nao_e_piquete()
returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare v_pai uuid; v_nome text; v_nome_pai text;
begin
  if coalesce(current_setting('app.pasto_unidade_desfazer', true), '') = 'on' then return new; end if;
  v_pai := public._fn_pai_do_piquete(new.pasto_id);
  if v_pai is null then return new; end if;
  select nome into v_nome from public.pastos where id = new.pasto_id;
  select nome into v_nome_pai from public.pastos where id = v_pai;
  raise exception using errcode = 'P0001',
    message = format('%s é piquete de %s: o lançamento é no card de %s (escolha o piquete na linha). Nada foi gravado.', v_nome, v_nome_pai, v_nome_pai);
end $$;
revoke all on function public._fn_card_nao_e_piquete() from public, anon, authenticated;
create trigger trg_card_nao_e_piquete before insert or update of pasto_id on public.fechamento_pastos
  for each row execute function public._fn_card_nao_e_piquete();

-- 5) a área do mês do pasto dividido = a soma dos piquetes vigentes (o corpo de antes segue como a área própria) ------------------------
do $g$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fn_pasto_area_no_mes(uuid, text)'::regprocedure) <> 'a04b6173641eb97c098b26030f4043b5' then
    raise exception 'FECH-PASTO-UNIDADE-01: fn_pasto_area_no_mes mudou desde a 116120. Nada foi gravado.';
  end if;
end $g$;
create or replace function public.fn_pasto_area_no_mes(p_pasto uuid, p_ano_mes text)
returns numeric
language sql stable set search_path = pg_catalog, public
as $$
  select coalesce(
    /* FECH-PASTO-UNIDADE-01: o pasto dividido vale a soma dos piquetes vigentes no mês (o piquete não tem piquete: a recursão para nele) */
    (select sum(public.fn_pasto_area_no_mes(q.id, p_ano_mes))
       from public.pastos q join public.pasto_grupos g on g.id = q.grupo_id
      where g.pasto_origem_id = p_pasto and g.ativo and q.id <> p_pasto
        and public.fn_pasto_vigente_no_mes(q.ativo, q.data_inicio, q.data_fim, p_ano_mes)),
    (select v.area_ha from public.pasto_area_vigencias v
      where v.pasto_id = p_pasto and v.desfeita_em is null and v.vigente_desde <= to_date(p_ano_mes || '-01', 'YYYY-MM-DD')
      order by v.vigente_desde desc limit 1),
    (select v.area_anterior_ha from public.pasto_area_vigencias v
      where v.pasto_id = p_pasto and v.desfeita_em is null
      order by v.vigente_desde asc limit 1),
    (select v.area_anterior_ha from public.pasto_area_vigencias v
      where v.pasto_id = p_pasto
      order by v.vigente_desde asc, v.criado_em asc limit 1),
    (select p.area_produtiva_ha from public.pastos p where p.id = p_pasto))
$$;

-- 6) o gravador do card: linhas com e sem piquete no mesmo card ------------------------------------------------------------------------
do $g$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fn_fechamento_pasto_salvar(uuid, jsonb, jsonb)'::regprocedure) <> 'd520b12787db0bb50696e0c21b86c5bb' then
    raise exception 'FECH-PASTO-UNIDADE-01: fn_fechamento_pasto_salvar mudou desde a 117420. Nada foi gravado.';
  end if;
end $g$;
CREATE OR REPLACE FUNCTION public.fn_fechamento_pasto_salvar(p_fechamento_id uuid, p_campos jsonb, p_itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fp public.fechamento_pastos%ROWTYPE;
  v_marcas jsonb;
  v_lotes jsonb;
  v_n integer;
  v_recebe text;
BEGIN
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[(
    SELECT f.cliente_id FROM public.fechamento_pastos fp JOIN public.fazendas f ON f.id = fp.fazenda_id WHERE fp.id = p_fechamento_id)]);
  SELECT * INTO v_fp FROM public.fechamento_pastos WHERE id = p_fechamento_id FOR UPDATE;
  IF v_fp.status = 'fechado' THEN
    RAISE EXCEPTION 'O pasto está fechado neste mês. Reabra o pasto antes de alterar.' USING ERRCODE = 'P0001';
  END IF;
  IF public._fn_fechamento_p2_travado(v_fp.fazenda_id, v_fp.ano_mes) THEN
    RAISE EXCEPTION 'Mês % possui Valor do Rebanho validado ou P2 fechado. Reabra o pilar P2 antes de alterar pastos.', v_fp.ano_mes
      USING ERRCODE = 'P0001';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'Itens do pasto em formato inválido.' USING ERRCODE = '22023';
  END IF;

  /* FECH-ROTACAO-01 F3-4(a): vedar um pasto que RECEBE o lote de outro card no mês contradiz a alocação — tire-o de lá antes */
  IF p_campos ? 'tipo_uso_mes' AND NULLIF(p_campos->>'tipo_uso_mes', '') = 'vedado' THEN
    SELECT format('O %s recebe o lote do %s neste mês. Tire-o de lá antes de vedar.', d.nome, o.nome) INTO v_recebe
      FROM public.fechamento_alocacoes a
      JOIN public.fechamento_pastos c ON c.id = a.fechamento_id
      JOIN public.pastos o ON o.id = c.pasto_id
      JOIN public.pastos d ON d.id = a.pasto_id
     WHERE a.pasto_id = v_fp.pasto_id AND a.fazenda_id = v_fp.fazenda_id AND a.ano_mes = v_fp.ano_mes AND a.fechamento_id <> v_fp.id
     ORDER BY o.nome LIMIT 1;
    IF v_recebe IS NOT NULL THEN
      RAISE EXCEPTION '%', v_recebe USING ERRCODE = 'P0001';
    END IF;
  END IF;

  /* os campos do mes: so' os que vierem (a chave ausente mantem o gravado), vazio = nulo — o que `atualizarCamposMensais` fazia */
  UPDATE public.fechamento_pastos SET
    lote_mes       = CASE WHEN p_campos ? 'lote_mes'       THEN NULLIF(p_campos->>'lote_mes', '')               ELSE lote_mes END,
    tipo_uso_mes   = CASE WHEN p_campos ? 'tipo_uso_mes'   THEN NULLIF(p_campos->>'tipo_uso_mes', '')           ELSE tipo_uso_mes END,
    qualidade_mes  = CASE WHEN p_campos ? 'qualidade_mes'  THEN NULLIF(p_campos->>'qualidade_mes', '')::numeric ELSE qualidade_mes END,
    observacao_mes = CASE WHEN p_campos ? 'observacao_mes' THEN NULLIF(p_campos->>'observacao_mes', '')         ELSE observacao_mes END
  WHERE id = p_fechamento_id;

  /* os itens: a marca de peso de cada categoria e' lida ANTES de apagar e volta na linha nova (o que `salvarItens` fazia);
     LOTES-03: o lote de cada categoria tambem — o item que vier SEM a chave `lote_id` fica com o lote gravado; com a chave vazia, sem lote */
  /* FECH-PASTO-UNIDADE-01: a chave da linha é categoria + piquete (sem piquete = o pasto inteiro); a marca e o lote voltam pela MESMA chave */
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_itens) e WHERE COALESCE((e->>'quantidade')::integer, 0) > 0
              GROUP BY e->>'categoria_id', NULLIF(e->>'piquete_id', '') HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'A mesma categoria apareceu duas vezes no mesmo piquete. Junte as linhas antes de salvar. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(jsonb_object_agg(categoria_id::text || '|' || coalesce(piquete_id::text, ''), peso_atualizado), '{}'::jsonb),
         COALESCE(jsonb_object_agg(categoria_id::text || '|' || coalesce(piquete_id::text, ''), lote_id) FILTER (WHERE lote_id IS NOT NULL), '{}'::jsonb)
    INTO v_marcas, v_lotes
    FROM public.fechamento_pasto_itens WHERE fechamento_id = p_fechamento_id;
  DELETE FROM public.fechamento_pasto_itens WHERE fechamento_id = p_fechamento_id;
  INSERT INTO public.fechamento_pasto_itens (fechamento_id, categoria_id, quantidade, peso_medio_kg, lote, observacoes, origem_dado, peso_atualizado, lote_id, piquete_id)
  SELECT p_fechamento_id, (e->>'categoria_id')::uuid, (e->>'quantidade')::integer, NULLIF(e->>'peso_medio_kg', '')::numeric,
         NULLIF(e->>'lote', ''), NULLIF(e->>'observacoes', ''), COALESCE(NULLIF(e->>'origem_dado', ''), 'manual'),
         COALESCE((e->>'peso_atualizado')::boolean, (v_marcas->>((e->>'categoria_id') || '|' || coalesce(NULLIF(e->>'piquete_id', ''), '')))::boolean, false),
         CASE WHEN e ? 'lote_id' THEN NULLIF(e->>'lote_id', '')::uuid ELSE (v_lotes->>((e->>'categoria_id') || '|' || coalesce(NULLIF(e->>'piquete_id', ''), '')))::uuid END,
         NULLIF(e->>'piquete_id', '')::uuid
    FROM jsonb_array_elements(p_itens) e
   WHERE COALESCE((e->>'quantidade')::integer, 0) > 0;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'fechamento_id', p_fechamento_id, 'itens', v_n);
END $function$;

-- 7) voltar a "pasto inteiro": nenhuma cabeça se perde ---------------------------------------------------------------------------------
create or replace function public.fn_fechamento_pasto_inteiro(p_fechamento_id uuid, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare
  v_fp public.fechamento_pastos%rowtype; v_antes jsonb; v_depois jsonb; v_cab_antes int; v_cab_depois int; v_n int; v_nome text;
begin
  perform public._fn_exigir_tenant_das_linhas(array[(
    select f.cliente_id from public.fechamento_pastos fp join public.fazendas f on f.id = fp.fazenda_id where fp.id = p_fechamento_id)]);
  select * into v_fp from public.fechamento_pastos where id = p_fechamento_id for update;
  if v_fp.status = 'fechado' then
    raise exception using errcode = 'P0001', message = 'O pasto está fechado neste mês. Reabra o pasto antes de alterar.';
  end if;
  if public._fn_fechamento_p2_travado(v_fp.fazenda_id, v_fp.ano_mes) then
    raise exception using errcode = 'P0001',
      message = format('Mês %s possui Valor do Rebanho validado ou P2 fechado. Reabra o pilar P2 antes de alterar pastos.', v_fp.ano_mes);
  end if;
  select nome into v_nome from public.pastos where id = v_fp.pasto_id;
  select coalesce(jsonb_agg(to_jsonb(i) - 'created_at' order by i.categoria_id, i.piquete_id), '[]'::jsonb), coalesce(sum(i.quantidade), 0)
    into v_antes, v_cab_antes from public.fechamento_pasto_itens i where i.fechamento_id = p_fechamento_id;
  -- por categoria: cabeças somadas; peso médio ponderado pelas linhas que têm peso; o lote e o texto ficam só se forem um só
  select coalesce(jsonb_agg(jsonb_build_object('categoria_id', categoria_id, 'quantidade', q, 'peso_medio_kg', pm, 'lote_id', lote_id,
                                               'lote', lote, 'observacoes', obs, 'peso_atualizado', pa, 'linhas', n)), '[]'::jsonb),
         coalesce(sum(q), 0)
    into v_depois, v_cab_depois
    from (select i.categoria_id, sum(i.quantidade)::int q,
                 round(sum(i.quantidade * i.peso_medio_kg) filter (where i.peso_medio_kg > 0)
                       / nullif(sum(i.quantidade) filter (where i.peso_medio_kg > 0), 0), 2) pm,
                 case when count(distinct i.lote_id) = 1 and count(*) filter (where i.lote_id is null) = 0 then min(i.lote_id::text)::uuid end lote_id,
                 case when count(distinct i.lote) = 1 then min(i.lote) end lote,
                 nullif(string_agg(distinct i.observacoes, ' · '), '') obs, bool_or(i.peso_atualizado) pa, count(*) n
            from public.fechamento_pasto_itens i where i.fechamento_id = p_fechamento_id group by i.categoria_id) x;
  if v_cab_depois <> v_cab_antes then
    raise exception using errcode = 'P0001', message = format('A conta das cabeças não fechou (antes %s, depois %s). Nada foi gravado.', v_cab_antes, v_cab_depois);
  end if;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'cabecas', v_cab_antes, 'antes', v_antes, 'depois', v_depois,
      'frase', format('%s volta a pasto inteiro: %s cab em %s categoria(s); nenhum piquete fica marcado.', v_nome, v_cab_antes, jsonb_array_length(v_depois)));
  end if;
  delete from public.fechamento_pasto_itens where fechamento_id = p_fechamento_id;
  insert into public.fechamento_pasto_itens (fechamento_id, categoria_id, quantidade, peso_medio_kg, lote, observacoes, origem_dado, peso_atualizado, lote_id, piquete_id)
  select p_fechamento_id, (e->>'categoria_id')::uuid, (e->>'quantidade')::int, nullif(e->>'peso_medio_kg', '')::numeric, e->>'lote', e->>'observacoes',
         'ajustado', coalesce((e->>'peso_atualizado')::boolean, false), nullif(e->>'lote_id', '')::uuid, null
    from jsonb_array_elements(v_depois) e;
  get diagnostics v_n = row_count;
  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
  values (v_fp.cliente_id, v_fp.fazenda_id, auth.uid(), 'fechamento', 'card_pasto_inteiro', 'fechamento_pastos', v_fp.id,
          format('%s em %s voltou a pasto inteiro (%s cab)', v_nome, v_fp.ano_mes, v_cab_antes), jsonb_build_object('itens', v_antes), jsonb_build_object('itens', v_depois));
  return jsonb_build_object('ok', true, 'simulado', false, 'cabecas', v_cab_depois, 'linhas', v_n);
end $$;
revoke all on function public.fn_fechamento_pasto_inteiro(uuid, boolean) from public, anon;
grant execute on function public.fn_fechamento_pasto_inteiro(uuid, boolean) to authenticated;

-- 8) P1, conjunto do mês e pendências: só pastos ---------------------------------------------------------------------------------------
-- P1: o card de piquete que sobrou de antes (vazio) não conta; o P1 é do pasto
select pg_temp.fpu_patch('public._fn_status_pilares_fechamento(uuid, text)'::regprocedure, '9946f4800db3bf11a69ba9b661e6c218',
  array[$a0$        AND p.tipo_uso IS DISTINCT FROM 'divergencia'
        AND (p.data_inicio IS NULL OR p.data_inicio <= _mes_fim)$a0$],
  array[$b0$        AND p.tipo_uso IS DISTINCT FROM 'divergencia'
        AND public._fn_pai_do_piquete(p.id) IS NULL
        AND (p.data_inicio IS NULL OR p.data_inicio <= _mes_fim)$b0$]);
-- o conjunto do mês (snapshot do P1, área regenerada) é de pastos: o piquete é subárea e a área dele já está no pai
select pg_temp.fpu_patch('public.fn_pastos_aplicaveis_mes(uuid, text)'::regprocedure, 'da3a596fd4dc6205b18cc6594fa902bf',
  array[$a0$    AND p.ativo = true
    AND p.tipo_uso IS DISTINCT FROM 'divergencia'
$a0$],
  array[$b0$    AND p.ativo = true
    AND p.tipo_uso IS DISTINCT FROM 'divergencia'
    AND public._fn_pai_do_piquete(p.id) IS NULL
$b0$]);
-- pendência do mês: o card vazio de piquete que sobrou não é pendência
select pg_temp.fpu_patch('public.fn_pendencias_fechamento_mes(uuid, text)'::regprocedure, '91ab0aa056d1e0aa249c94f122e0496d',
  array[$a0$AND fp.status IN ('rascunho','aberto');$a0$],
  array[$b0$AND fp.status IN ('rascunho','aberto')
      AND public._fn_pai_do_piquete(fp.pasto_id) IS NULL;$b0$]);
