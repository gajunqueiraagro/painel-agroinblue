-- LOTES-03 F1 (Gabriel 06/11/2026) — o LOTE: identidade e estratégia, nunca cabeça nem peso (esses vêm do fechamento, fonte única).
-- Código = CAT-RAÇA-ATIV-NN (D5 hífen), número por fazenda e por combinação (D2), o próximo é o maior + 1 contando encerrados e
-- cancelados (D3); mudou categoria/raça/atividade = mesmo lote, código novo, o antigo em `codigos_antigos` (histórico e busca, D1);
-- carimbo em campo próprio (D4). Escrita SÓ pelas RPCs (trava `app.lote_escritor`); trilha em `audit_log`.
-- Caminho de volta: editar, encerrar/reabrir, cancelar (só sem lançamento no fechamento) e desfazer o cancelamento.
set local lock_timeout = '2s';

create table public.rebanho_lotes (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.clientes(id),
  fazenda_id        uuid not null references public.fazendas(id),
  categoria_id      uuid not null references public.rebanho_lote_cadastros(id),
  raca_id           uuid not null references public.rebanho_lote_cadastros(id),
  atividade_id      uuid not null references public.rebanho_lote_cadastros(id),
  numero            integer not null check (numero >= 1),
  codigo            text not null,
  codigos_antigos   text[] not null default '{}',
  nome_campeiro     text check (nome_campeiro is null or (btrim(nome_campeiro) <> '' and length(nome_campeiro) <= 40)),
  formado_em        date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  situacao          text not null default 'ativo' check (situacao in ('ativo', 'encerrado', 'cancelado')),
  encerrado_em      date,
  sistema_id        uuid references public.rebanho_lote_cadastros(id),
  programa_id       uuid references public.rebanho_lote_cadastros(id),
  destino_id        uuid references public.rebanho_lote_cadastros(id),
  safra             text check (safra is null or safra ~ '^[0-9]{2}/[0-9]{2}$'),
  carimbo           text check (carimbo is null or carimbo ~ '^(1[0-2]|[1-9])\.[1-9][0-9]?$'),
  idade_media_meses integer check (idade_media_meses is null or idade_media_meses between 0 and 400),
  meta_peso_kg      numeric(7,1) check (meta_peso_kg is null or meta_peso_kg > 0),
  meta_gmd_kg       numeric(5,3) check (meta_gmd_kg is null or meta_gmd_kg > 0),
  meta_data         date,
  versao            integer not null default 1,
  criado_em         timestamptz not null default now(),
  criado_por        uuid default auth.uid(),
  atualizado_em     timestamptz not null default now()
);
create unique index rebanho_lotes_codigo_unico on public.rebanho_lotes (fazenda_id, codigo) where situacao <> 'cancelado';
create unique index rebanho_lotes_numero_unico on public.rebanho_lotes (fazenda_id, categoria_id, raca_id, atividade_id, numero);
create index rebanho_lotes_cliente on public.rebanho_lotes (cliente_id, fazenda_id);

alter table public.rebanho_lotes enable row level security;
create policy rebanho_lotes_select_tenant on public.rebanho_lotes for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.rebanho_lotes from public, anon;
grant select on public.rebanho_lotes to authenticated;
create trigger trg_rebanho_lotes_so_pelo_escritor before insert or update or delete on public.rebanho_lotes
  for each row execute function public._fn_lote_so_pelo_escritor();
create trigger trg_trilha_cadastro after insert or update or delete on public.rebanho_lotes
  for each row execute function public._fn_trilha_cadastro('lotes');

/* um item do cadastro do cliente, do tipo certo; `p_vivo` exige ativo (escolha nova) */
create or replace function public._fn_lote_item_ok(p_item uuid, p_tipo text, p_cliente uuid, p_vivo boolean)
returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public' as $$
  select p_item is null or exists (select 1 from public.rebanho_lote_cadastros c
                                    where c.id = p_item and c.tipo = p_tipo and c.cliente_id = p_cliente and (c.ativo or not p_vivo))
$$;
revoke all on function public._fn_lote_item_ok(uuid, text, uuid, boolean) from public, anon;

/* o próximo número livre da combinação NA FAZENDA: o maior + 1, encerrados e cancelados contam (D3) */
create or replace function public._fn_lote_proximo_numero(p_fazenda uuid, p_categoria uuid, p_raca uuid, p_atividade uuid)
returns integer language sql stable security definer set search_path to 'pg_catalog', 'public' as $$
  select coalesce(max(numero), 0) + 1 from public.rebanho_lotes
   where fazenda_id = p_fazenda and categoria_id = p_categoria and raca_id = p_raca and atividade_id = p_atividade
$$;
revoke all on function public._fn_lote_proximo_numero(uuid, uuid, uuid, uuid) from public, anon;

create or replace function public.fn_lote_proximo_numero(p_fazenda uuid, p_categoria uuid, p_raca uuid, p_atividade uuid)
returns integer language plpgsql stable security definer set search_path to 'pg_catalog', 'public' as $$
begin
  perform public._fn_exigir_tenant_das_linhas(array[(select cliente_id from public.fazendas where id = p_fazenda)]);
  return public._fn_lote_proximo_numero(p_fazenda, p_categoria, p_raca, p_atividade);
end $$;
revoke all on function public.fn_lote_proximo_numero(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.fn_lote_proximo_numero(uuid, uuid, uuid, uuid) to authenticated;

create or replace function public._fn_lote_codigo(p_categoria uuid, p_raca uuid, p_atividade uuid, p_numero integer)
returns text language sql stable security definer set search_path to 'pg_catalog', 'public' as $$
  select (select sigla from public.rebanho_lote_cadastros where id = p_categoria) || '-' ||
         (select sigla from public.rebanho_lote_cadastros where id = p_raca) || '-' ||
         (select sigla from public.rebanho_lote_cadastros where id = p_atividade) || '-' || lpad(p_numero::text, 2, '0')
$$;
revoke all on function public._fn_lote_codigo(uuid, uuid, uuid, integer) from public, anon;

/* Criar (p_id nulo) ou editar o lote (identidade + perfil + metas). Só as chaves que vierem mudam. Devolve o que muda (prévia). */
create or replace function public.fn_lote_salvar(p_id uuid, p_fazenda uuid, p_campos jsonb, p_versao integer default null,
  p_motivo text default null, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare
  o public.rebanho_lotes%rowtype; n public.rebanho_lotes%rowtype;
  v_cli uuid; k text; v_muda jsonb := '[]'::jsonb; v_ident boolean;
  v_ok constant text[] := array['categoria_id', 'raca_id', 'atividade_id', 'numero', 'nome_campeiro', 'formado_em', 'sistema_id',
                                'programa_id', 'destino_id', 'safra', 'carimbo', 'idade_media_meses', 'meta_peso_kg', 'meta_gmd_kg', 'meta_data'];
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
      sistema_id, programa_id, destino_id, safra, carimbo, idade_media_meses, meta_peso_kg, meta_gmd_kg, meta_data)
    values (n.cliente_id, n.fazenda_id, n.categoria_id, n.raca_id, n.atividade_id, n.numero, n.codigo, n.nome_campeiro, n.formado_em,
      n.sistema_id, n.programa_id, n.destino_id, n.safra, n.carimbo, n.idade_media_meses, n.meta_peso_kg, n.meta_gmd_kg, n.meta_data)
    returning * into n;
  else
    update public.rebanho_lotes set categoria_id = n.categoria_id, raca_id = n.raca_id, atividade_id = n.atividade_id, numero = n.numero,
      codigo = n.codigo, codigos_antigos = n.codigos_antigos, nome_campeiro = n.nome_campeiro, formado_em = n.formado_em,
      sistema_id = n.sistema_id, programa_id = n.programa_id, destino_id = n.destino_id, safra = n.safra, carimbo = n.carimbo,
      idade_media_meses = n.idade_media_meses, meta_peso_kg = n.meta_peso_kg, meta_gmd_kg = n.meta_gmd_kg, meta_data = n.meta_data,
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

/* Encerrar, reabrir, cancelar (só sem lançamento no fechamento) e desfazer o cancelamento (= 'ativo'). */
create or replace function public.fn_lote_situacao(p_id uuid, p_situacao text, p_versao integer, p_motivo text default null,
  p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare o public.rebanho_lotes%rowtype; v_lanc integer; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into o from public.rebanho_lotes where id = p_id for update;
  perform public._fn_exigir_tenant_das_linhas(array[o.cliente_id]);
  if p_versao is distinct from o.versao then
    raise exception using errcode = '40001', message = 'Outra pessoa salvou este lote antes de você. Feche e abra a ficha de novo. Nada foi gravado.';
  end if;
  if p_situacao is null or p_situacao not in ('ativo', 'encerrado', 'cancelado') then
    raise exception using errcode = 'P0001', message = 'Situação desconhecida. Nada foi gravado.';
  end if;
  if p_situacao = o.situacao then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'sem_mudanca', true, 'situacao', o.situacao, 'versao', o.versao);
  end if;
  if p_situacao = 'cancelado' then
    select count(*) into v_lanc from public.fechamento_pasto_itens where lote_id = p_id;
    if v_lanc > 0 then
      raise exception using errcode = 'P0001',
        message = format('Não dá para cancelar: %s tem %s lançamento%s no fechamento. Use Encerrar lote.', o.codigo, v_lanc,
                         case when v_lanc > 1 then 's' else '' end);
    end if;
  end if;
  if p_situacao = 'ativo' and o.situacao = 'cancelado' and exists (
       select 1 from public.rebanho_lotes x where x.fazenda_id = o.fazenda_id and x.codigo = o.codigo and x.situacao <> 'cancelado' and x.id <> o.id) then
    raise exception using errcode = 'P0001', message = format('Já existe outro lote %s nesta fazenda: este não volta.', o.codigo);
  end if;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'sem_mudanca', false, 'antes', o.situacao, 'situacao', p_situacao, 'versao', o.versao);
  end if;
  perform set_config('app.lote_escritor', '1', true);
  perform set_config('app.motivo', coalesce(nullif(btrim(coalesce(p_motivo, '')), ''),
    case p_situacao when 'encerrado' then 'lote encerrado' when 'cancelado' then 'lote cancelado' else 'lote reaberto' end), true);
  update public.rebanho_lotes set situacao = p_situacao, encerrado_em = case when p_situacao = 'encerrado' then v_hoje end,
         versao = o.versao + 1, atualizado_em = now()
   where id = p_id;
  perform set_config('app.lote_escritor', '', true);
  perform set_config('app.motivo', '', true);
  return jsonb_build_object('ok', true, 'simulado', false, 'sem_mudanca', false, 'antes', o.situacao, 'situacao', p_situacao, 'versao', o.versao + 1);
end $$;
revoke all on function public.fn_lote_situacao(uuid, text, integer, text, boolean) from public, anon;
grant execute on function public.fn_lote_situacao(uuid, text, integer, text, boolean) to authenticated;
