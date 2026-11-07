-- LOTES-03 (Gabriel 07/11/2026, regra 1 da semente aprovada 11:13) — o lote marcado "conferir": `rebanho_lotes.conferir` (texto curto
-- do que conferir; nulo = nada a conferir). Grava SÓ pela `fn_lote_salvar` (chave `conferir`; vazio = conferido), com trilha; a lista
-- (`fn_lotes_da_fazenda`) devolve a coluna para o selo da tela. A semente NJ marca os lotes da D9 (sigla do nome × lançado) e os de
-- carimbo sem o nº do lote. Volta: Conferido na ficha (conferir vazio). Corpos = 117410/117420 + só o `conferir` (md5 conferido abaixo).
set local lock_timeout = '2s';

alter table public.rebanho_lotes add column conferir text check (conferir is null or (btrim(conferir) <> '' and length(conferir) <= 80));

do $$
begin
  if md5(pg_get_functiondef('public.fn_lote_salvar(uuid,uuid,jsonb,integer,text,boolean)'::regprocedure)) <> 'c7975e8b51138a6fb7d7ec506d959cc0'
     or md5(pg_get_functiondef('public.fn_lotes_da_fazenda(uuid,text)'::regprocedure)) <> '0ea800c926d70b1a3da51f7b9be73d3f' then
    raise exception 'fn_lote_salvar ou fn_lotes_da_fazenda mudou desde a 117410/117420 (md5 diferente): pare e releia o corpo.';
  end if;
end $$;

create or replace function public.fn_lote_salvar(p_id uuid, p_fazenda uuid, p_campos jsonb, p_versao integer default null,
  p_motivo text default null, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare
  o public.rebanho_lotes%rowtype; n public.rebanho_lotes%rowtype;
  v_cli uuid; k text; v_muda jsonb := '[]'::jsonb; v_ident boolean;
  v_ok constant text[] := array['categoria_id', 'raca_id', 'atividade_id', 'numero', 'nome_campeiro', 'formado_em', 'sistema_id',
                                'programa_id', 'destino_id', 'safra', 'carimbo', 'idade_media_meses', 'meta_peso_kg', 'meta_gmd_kg', 'meta_data', 'conferir'];
  v_txt text;
begin
  if p_campos is null or jsonb_typeof(p_campos) <> 'object' then
    raise exception using errcode = 'P0001', message = 'Nada a gravar.';
  end if;
  for k in select jsonb_object_keys(p_campos) loop
    if k in ('cab', 'cabecas', 'peso', 'gmd', 'pasto', 'custo') then
      raise exception using errcode = 'P0001', message = 'Cabeças, peso, GMD, pasto e custo vêm do fechamento: não se gravam no lote. Nada foi gravado.';
    elsif not (k = any (v_ok)) then
      raise exception using errcode = 'P0001', message = format('Campo desconhecido no lote: %s. Nada foi gravado.', k);
    end if;
  end loop;

  if p_id is null then
    select cliente_id into v_cli from public.fazendas where id = p_fazenda;
    perform public._fn_exigir_tenant_das_linhas(array[v_cli]);
    n.id := null; n.cliente_id := v_cli; n.fazenda_id := p_fazenda; n.situacao := 'ativo'; n.versao := 1; n.codigos_antigos := '{}';
    n.formado_em := (now() at time zone 'America/Sao_Paulo')::date;
  else
    select * into o from public.rebanho_lotes where id = p_id for update;
    perform public._fn_exigir_tenant_das_linhas(array[o.cliente_id]);
    if p_fazenda is not null and p_fazenda <> o.fazenda_id then
      raise exception using errcode = 'P0001', message = 'O lote não muda de fazenda. Nada foi gravado.';
    end if;
    if p_versao is distinct from o.versao then
      raise exception using errcode = '40001', message = 'Outra pessoa salvou este lote antes de você. Feche e abra a ficha de novo. Nada foi gravado.';
    end if;
    if o.situacao = 'cancelado' then
      raise exception using errcode = 'P0001', message = 'O lote está cancelado. Desfaça o cancelamento antes de editar.';
    end if;
    n := o; v_cli := o.cliente_id;
  end if;

  if p_campos ? 'categoria_id' then n.categoria_id := nullif(p_campos->>'categoria_id', '')::uuid; end if;
  if p_campos ? 'raca_id' then n.raca_id := nullif(p_campos->>'raca_id', '')::uuid; end if;
  if p_campos ? 'atividade_id' then n.atividade_id := nullif(p_campos->>'atividade_id', '')::uuid; end if;
  if n.categoria_id is null or n.raca_id is null or n.atividade_id is null then
    raise exception using errcode = 'P0001', message = 'Escolha a categoria, a raça e a atividade do lote.';
  end if;
  if not public._fn_lote_item_ok(n.categoria_id, 'categoria', v_cli, n.categoria_id is distinct from o.categoria_id)
     or not public._fn_lote_item_ok(n.raca_id, 'raca', v_cli, n.raca_id is distinct from o.raca_id)
     or not public._fn_lote_item_ok(n.atividade_id, 'atividade', v_cli, n.atividade_id is distinct from o.atividade_id) then
    raise exception using errcode = 'P0001', message = 'A categoria, a raça ou a atividade não está no cadastro. Escolha de novo.';
  end if;
  if p_campos ? 'nome_campeiro' then n.nome_campeiro := nullif(btrim(coalesce(p_campos->>'nome_campeiro', '')), ''); end if;
  if n.nome_campeiro is not null and length(n.nome_campeiro) > 40 then
    raise exception using errcode = 'P0001', message = 'O nome do campeiro passa de 40 letras.';
  end if;
  if p_campos ? 'formado_em' then
    n.formado_em := nullif(p_campos->>'formado_em', '')::date;
    if n.formado_em is null then raise exception using errcode = 'P0001', message = 'Formado em: escolha a data.'; end if;
    if n.formado_em > (now() at time zone 'America/Sao_Paulo')::date then
      raise exception using errcode = 'P0001', message = 'Formado em: a data não pode ser depois de hoje.';
    end if;
  end if;
  if p_campos ? 'sistema_id' then n.sistema_id := nullif(p_campos->>'sistema_id', '')::uuid; end if;
  if p_campos ? 'programa_id' then n.programa_id := nullif(p_campos->>'programa_id', '')::uuid; end if;
  if p_campos ? 'destino_id' then n.destino_id := nullif(p_campos->>'destino_id', '')::uuid; end if;
  if not public._fn_lote_item_ok(n.sistema_id, 'sistema', v_cli, n.sistema_id is distinct from o.sistema_id)
     or not public._fn_lote_item_ok(n.programa_id, 'programa', v_cli, n.programa_id is distinct from o.programa_id)
     or not public._fn_lote_item_ok(n.destino_id, 'destino', v_cli, n.destino_id is distinct from o.destino_id) then
    raise exception using errcode = 'P0001', message = 'O sistema, o programa ou o destino não está no cadastro. Escolha de novo.';
  end if;
  if p_campos ? 'safra' then
    n.safra := nullif(btrim(coalesce(p_campos->>'safra', '')), '');
    if n.safra is not null and n.safra !~ '^[0-9]{2}/[0-9]{2}$' then raise exception using errcode = 'P0001', message = 'Safra: no formato 26/27.'; end if;
  end if;
  if p_campos ? 'carimbo' then
    n.carimbo := nullif(btrim(coalesce(p_campos->>'carimbo', '')), '');
    if n.carimbo is not null and n.carimbo !~ '^(1[0-2]|[1-9])\.[1-9][0-9]?$' then
      raise exception using errcode = 'P0001', message = 'Carimbo: mês.lote, ex.: 7.1 (nascidos em julho, 1º lote do mês).';
    end if;
  end if;
  if p_campos ? 'idade_media_meses' then
    v_txt := nullif(btrim(coalesce(p_campos->>'idade_media_meses', '')), '');
    if v_txt is not null and v_txt !~ '^[0-9]{1,3}$' then raise exception using errcode = 'P0001', message = 'Idade média: em meses, só o número.'; end if;
    n.idade_media_meses := v_txt::integer;
  end if;
  if p_campos ? 'meta_peso_kg' then n.meta_peso_kg := nullif(p_campos->>'meta_peso_kg', '')::numeric; end if;
  if p_campos ? 'meta_gmd_kg' then n.meta_gmd_kg := nullif(p_campos->>'meta_gmd_kg', '')::numeric; end if;
  if p_campos ? 'meta_data' then n.meta_data := nullif(p_campos->>'meta_data', '')::date; end if;
  if (n.meta_peso_kg is not null and n.meta_peso_kg <= 0) or (n.meta_gmd_kg is not null and n.meta_gmd_kg <= 0) then
    raise exception using errcode = 'P0001', message = 'A meta precisa ser maior que zero.';
  end if;
  /* LOTES-03 (117440): o que falta conferir no lote; vazio = conferido */
  if p_campos ? 'conferir' then
    n.conferir := nullif(btrim(coalesce(p_campos->>'conferir', '')), '');
    if n.conferir is not null and length(n.conferir) > 80 then
      raise exception using errcode = 'P0001', message = 'O que conferir passa de 80 letras.';
    end if;
  end if;

  /* o número: criar = o próximo; identidade mudou = o próximo da combinação nova (D1/D3); `numero` explícito só para voltar a um
     código que JÁ FOI deste lote (o Desfazer da identidade) */
  v_ident := p_id is null or (n.categoria_id, n.raca_id, n.atividade_id) is distinct from (o.categoria_id, o.raca_id, o.atividade_id);
  if p_campos ? 'numero' then
    n.numero := (p_campos->>'numero')::integer;
    if p_id is null or not (public._fn_lote_codigo(n.categoria_id, n.raca_id, n.atividade_id, n.numero) = any (o.codigos_antigos || o.codigo)) then
      raise exception using errcode = 'P0001', message = 'O número sai sozinho: o próximo livre da combinação na fazenda.';
    end if;
  elsif v_ident then
    n.numero := public._fn_lote_proximo_numero(n.fazenda_id, n.categoria_id, n.raca_id, n.atividade_id);
  end if;
  n.codigo := public._fn_lote_codigo(n.categoria_id, n.raca_id, n.atividade_id, n.numero);
  if p_id is not null and n.codigo <> o.codigo then
    n.codigos_antigos := array_remove(o.codigos_antigos, n.codigo) || o.codigo;
  end if;
  if exists (select 1 from public.rebanho_lotes x where x.fazenda_id = n.fazenda_id and x.codigo = n.codigo and x.situacao <> 'cancelado'
                and x.id is distinct from p_id) then
    raise exception using errcode = 'P0001', message = format('Já existe o lote %s nesta fazenda.', n.codigo);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('campo', a.key, 'antes', a.value, 'depois', b.value) order by a.key), '[]'::jsonb) into v_muda
    from jsonb_each(to_jsonb(o)) a
    join jsonb_each(to_jsonb(n)) b on b.key = a.key
   where p_id is not null and a.key not in ('versao', 'atualizado_em', 'criado_em', 'criado_por', 'id')
     and a.value is distinct from b.value;
  if p_id is null then v_muda := jsonb_build_array(jsonb_build_object('campo', 'codigo', 'antes', null, 'depois', n.codigo)); end if;

  if p_simular or (p_id is not null and jsonb_array_length(v_muda) = 0) then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'sem_mudanca', jsonb_array_length(v_muda) = 0, 'id', p_id,
                              'codigo', n.codigo, 'codigo_antigo', case when p_id is not null and n.codigo <> o.codigo then o.codigo end,
                              'numero', n.numero, 'muda', v_muda, 'versao', coalesce(o.versao, 1));
  end if;

  perform set_config('app.lote_escritor', '1', true);
  perform set_config('app.motivo', coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), case when p_id is null then 'lote criado' else 'lote editado' end), true);
  if p_id is null then
    insert into public.rebanho_lotes (cliente_id, fazenda_id, categoria_id, raca_id, atividade_id, numero, codigo, nome_campeiro, formado_em,
      sistema_id, programa_id, destino_id, safra, carimbo, idade_media_meses, meta_peso_kg, meta_gmd_kg, meta_data, conferir)
    values (n.cliente_id, n.fazenda_id, n.categoria_id, n.raca_id, n.atividade_id, n.numero, n.codigo, n.nome_campeiro, n.formado_em,
      n.sistema_id, n.programa_id, n.destino_id, n.safra, n.carimbo, n.idade_media_meses, n.meta_peso_kg, n.meta_gmd_kg, n.meta_data, n.conferir)
    returning * into n;
  else
    update public.rebanho_lotes set categoria_id = n.categoria_id, raca_id = n.raca_id, atividade_id = n.atividade_id, numero = n.numero,
      codigo = n.codigo, codigos_antigos = n.codigos_antigos, nome_campeiro = n.nome_campeiro, formado_em = n.formado_em,
      sistema_id = n.sistema_id, programa_id = n.programa_id, destino_id = n.destino_id, safra = n.safra, carimbo = n.carimbo,
      idade_media_meses = n.idade_media_meses, meta_peso_kg = n.meta_peso_kg, meta_gmd_kg = n.meta_gmd_kg, meta_data = n.meta_data, conferir = n.conferir,
      versao = o.versao + 1, atualizado_em = now()
     where id = p_id returning * into n;
  end if;
  perform set_config('app.lote_escritor', '', true);
  perform set_config('app.motivo', '', true);
  return jsonb_build_object('ok', true, 'simulado', false, 'sem_mudanca', false, 'id', n.id, 'codigo', n.codigo,
                            'codigo_antigo', case when p_id is not null and n.codigo <> o.codigo then o.codigo end,
                            'numero', n.numero, 'muda', v_muda, 'versao', n.versao);
end $$;
revoke all on function public.fn_lote_salvar(uuid, uuid, jsonb, integer, text, boolean) from public, anon;
grant execute on function public.fn_lote_salvar(uuid, uuid, jsonb, integer, text, boolean) to authenticated;

/* a lista ganha a coluna `conferir` no fim: o tipo de retorno muda, então sai e volta (sem dependentes; o mesmo EXECUTE) */
drop function public.fn_lotes_da_fazenda(uuid, text);
create or replace function public.fn_lotes_da_fazenda(p_fazenda uuid, p_ano_mes text)
returns table (id uuid, codigo text, codigos_antigos text[], nome_campeiro text, situacao text, formado_em date, encerrado_em date,
  categoria_id uuid, raca_id uuid, atividade_id uuid, numero integer, sistema_id uuid, programa_id uuid, destino_id uuid, safra text,
  carimbo text, idade_media_meses integer, meta_peso_kg numeric, meta_gmd_kg numeric, meta_data date, versao integer,
  ano_mes_dado text, cabecas integer, peso_medio_kg numeric, gmd_kg numeric, pastos text[], lancamentos integer, conferir text)
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
         (select count(*)::integer from public.fechamento_pasto_itens x where x.lote_id = l.id),
         l.conferir
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
