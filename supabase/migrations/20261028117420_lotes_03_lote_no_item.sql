-- LOTES-03 F1 (Gabriel 06/11/2026) — o LOTE no lançamento do fechamento: `fechamento_pasto_itens.lote_id` (opcional, D1 da LOTES-01).
-- Cabeça, peso, GMD e pasto do lote se LEEM daqui (fonte única); o lote nunca guarda uma cópia.
-- `fn_fechamento_pasto_salvar` passa a gravar o `lote_id` de cada item e a PRESERVAR o gravado quando o item vier sem a chave (quem salva
-- sem saber de lote não apaga o lote). As travas de hoje ficam: card fechado e mês com o Valor do Rebanho validado não recebem lote.
-- Lote em 2+ pastos é permitido. Volta: tirar o lote do item no modal (lote_id vazio).
set local lock_timeout = '2s';

alter table public.fechamento_pasto_itens add column lote_id uuid references public.rebanho_lotes(id);
create index fechamento_pasto_itens_lote on public.fechamento_pasto_itens (lote_id) where lote_id is not null;

/* o lote do item é da MESMA fazenda do card e não está cancelado (o encerrado ainda fecha o mês em que encerrou) */
create or replace function public._fn_item_lote_ok()
returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare v_faz uuid; v_lote public.rebanho_lotes%rowtype;
begin
  if new.lote_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.lote_id is not distinct from old.lote_id then return new; end if;
  select fazenda_id into v_faz from public.fechamento_pastos where id = new.fechamento_id;
  select * into v_lote from public.rebanho_lotes where id = new.lote_id;
  if v_lote.id is null or v_lote.fazenda_id is distinct from v_faz then
    raise exception using errcode = 'P0001', message = 'O lote escolhido é de outra fazenda. Escolha de novo. Nada foi gravado.';
  end if;
  if v_lote.situacao = 'cancelado' then
    raise exception using errcode = 'P0001', message = format('O lote %s está cancelado. Escolha outro. Nada foi gravado.', v_lote.codigo);
  end if;
  return new;
end $$;
revoke all on function public._fn_item_lote_ok() from public, anon;
create trigger trg_item_lote_ok before insert or update of lote_id on public.fechamento_pasto_itens
  for each row execute function public._fn_item_lote_ok();

/* o gravador do card: o corpo de hoje (md5 16d34dac… conferido abaixo), com o `lote_id` lido antes de apagar e devolvido na linha nova */
do $$
begin
  if md5(pg_get_functiondef('public.fn_fechamento_pasto_salvar(uuid,jsonb,jsonb)'::regprocedure)) <> '16d34dac50cd775fb7e5968db58d47ce' then
    raise exception 'fn_fechamento_pasto_salvar mudou desde o ensaio do LOTES-03 (md5 diferente): pare e releia o corpo.';
  end if;
end $$;

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
  SELECT COALESCE(jsonb_object_agg(categoria_id::text, peso_atualizado), '{}'::jsonb),
         COALESCE(jsonb_object_agg(categoria_id::text, lote_id) FILTER (WHERE lote_id IS NOT NULL), '{}'::jsonb)
    INTO v_marcas, v_lotes
    FROM public.fechamento_pasto_itens WHERE fechamento_id = p_fechamento_id;
  DELETE FROM public.fechamento_pasto_itens WHERE fechamento_id = p_fechamento_id;
  INSERT INTO public.fechamento_pasto_itens (fechamento_id, categoria_id, quantidade, peso_medio_kg, lote, observacoes, origem_dado, peso_atualizado, lote_id)
  SELECT p_fechamento_id, (e->>'categoria_id')::uuid, (e->>'quantidade')::integer, NULLIF(e->>'peso_medio_kg', '')::numeric,
         NULLIF(e->>'lote', ''), NULLIF(e->>'observacoes', ''), COALESCE(NULLIF(e->>'origem_dado', ''), 'manual'),
         COALESCE((e->>'peso_atualizado')::boolean, (v_marcas->>(e->>'categoria_id'))::boolean, false),
         CASE WHEN e ? 'lote_id' THEN NULLIF(e->>'lote_id', '')::uuid ELSE (v_lotes->>(e->>'categoria_id'))::uuid END
    FROM jsonb_array_elements(p_itens) e
   WHERE COALESCE((e->>'quantidade')::integer, 0) > 0;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'fechamento_id', p_fechamento_id, 'itens', v_n);
END $function$;

/* A lista de Produção › Lotes: identidade + o que o FECHAMENTO diz do lote no mês (o último mês ≤ p_ano_mes com lançamento do lote).
   GMD = (peso médio do mês − peso médio do mês anterior do MESMO lote) ÷ dias do mês; sem o mês anterior, nulo ("—"). */
create or replace function public.fn_lotes_da_fazenda(p_fazenda uuid, p_ano_mes text)
returns table (id uuid, codigo text, codigos_antigos text[], nome_campeiro text, situacao text, formado_em date, encerrado_em date,
  categoria_id uuid, raca_id uuid, atividade_id uuid, numero integer, sistema_id uuid, programa_id uuid, destino_id uuid, safra text,
  carimbo text, idade_media_meses integer, meta_peso_kg numeric, meta_gmd_kg numeric, meta_data date, versao integer,
  ano_mes_dado text, cabecas integer, peso_medio_kg numeric, gmd_kg numeric, pastos text[], lancamentos integer)
language plpgsql stable security definer set search_path to 'pg_catalog', 'public'
set plan_cache_mode to 'force_custom_plan' as $$
#variable_conflict use_column
begin
  perform public._fn_exigir_tenant_das_linhas(array[(select f.cliente_id from public.fazendas f where f.id = p_fazenda)]);
  if p_ano_mes is null or p_ano_mes !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception using errcode = 'P0001', message = 'Mês: escolha o mês e o ano.';
  end if;
  return query
  with it as (
    select i.lote_id, fp.ano_mes, i.quantidade, i.peso_medio_kg, pa.nome as pasto
      from public.fechamento_pasto_itens i
      join public.fechamento_pastos fp on fp.id = i.fechamento_id
      join public.pastos pa on pa.id = fp.pasto_id
     where fp.fazenda_id = p_fazenda and i.lote_id is not null and fp.ano_mes <= p_ano_mes
  ), mes as (
    select lote_id, max(ano_mes) as ano_mes from it group by lote_id
  ), soma as (
    select it.lote_id, it.ano_mes, sum(it.quantidade)::integer as cab,
           sum(it.quantidade * it.peso_medio_kg) filter (where it.peso_medio_kg is not null)
             / nullif(sum(it.quantidade) filter (where it.peso_medio_kg is not null), 0) as peso,
           array_agg(distinct it.pasto order by it.pasto) as pastos
      from it group by it.lote_id, it.ano_mes
  )
  select l.id, l.codigo, l.codigos_antigos, l.nome_campeiro, l.situacao, l.formado_em, l.encerrado_em, l.categoria_id, l.raca_id,
         l.atividade_id, l.numero, l.sistema_id, l.programa_id, l.destino_id, l.safra, l.carimbo, l.idade_media_meses, l.meta_peso_kg,
         l.meta_gmd_kg, l.meta_data, l.versao,
         m.ano_mes, s.cab, round(s.peso, 1),
         case when s.peso is not null and a.peso is not null
              then round((s.peso - a.peso) / extract(day from (to_date(m.ano_mes || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day'))::numeric, 3) end,
         s.pastos,
         (select count(*)::integer from public.fechamento_pasto_itens x where x.lote_id = l.id)
    from public.rebanho_lotes l
    left join mes m on m.lote_id = l.id
    left join soma s on s.lote_id = l.id and s.ano_mes = m.ano_mes
    left join soma a on a.lote_id = l.id
                    and a.ano_mes = to_char(to_date(m.ano_mes || '-01', 'YYYY-MM-DD') - interval '1 month', 'YYYY-MM')
   where l.fazenda_id = p_fazenda and l.situacao <> 'cancelado'
   order by l.codigo;
end $$;
revoke all on function public.fn_lotes_da_fazenda(uuid, text) from public, anon;
grant execute on function public.fn_lotes_da_fazenda(uuid, text) to authenticated;
