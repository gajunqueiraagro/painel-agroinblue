-- LOTES-04 A (Gabriel 07/11/2026 17:26, mock lotes-codigo-lista.html aprovado; substitui o LOTE-SIGLA-EDITAR-01) — o MOTOR do código novo.
-- "Tudo se edita, cancela e desfaz":
--   1. Código = ATIVIDADE-CATEGORIA-RAÇA-NN (era CAT-RAÇA-ATIV-NN): `_fn_lote_codigo` muda a ordem; quem monta é só ela
--      (fn_lote_salvar chama por dentro), e a tela monta igual (`codigoDoLote`). Os lotes de hoje trocam na rodada (113210).
--   2. Sigla em uso pode mudar (categoria, raça, atividade): `fn_lote_cadastro_salvar` reescreve, na mesma transação, o código dos lotes
--      que usam o cadastro (a parte do tipo: 1ª atividade, 2ª categoria, 3ª raça) e guarda o código de antes em `codigos_antigos`
--      (a busca continua achando o lote pelo código velho). Trilha `audit_log` (autor, antes → depois, motivo "sigla DES → DF").
--      Recusa, sem gravar nada, se dois lotes da mesma fazenda ficariam com o mesmo código (diz quais). `p_simular` devolve `lotes`
--      [{id, antes, depois}] para a prévia. A `versao` do lote não muda (a ficha aberta continua salvando).
--   3. O nº do lote se edita (era só "o próximo livre"): `fn_lote_salvar` aceita `numero` de 1 a 99 quando ninguém da combinação na
--      fazenda tem aquele nº (os cancelados contam, como no índice). Remendo guardado pelo md5 da função publicada (117440).
-- Os lançamentos do fechamento ligam pelo `lote_id` (o texto `fechamento_pasto_itens.lote` está nulo nos ligados): nada muda neles.
-- VOLTA: _fn_lote_codigo, fn_lote_cadastro_salvar e fn_lote_salvar com os corpos de antes (md5 a1bf93cf…, 951c3feb…, 474f127b…: o
--   remendo inverso no fn_lote_salvar, trocando v_para por v_de; os outros dois pelo CREATE OR REPLACE da 117410/117400) e
--   DROP FUNCTION _fn_lote_codigo_troca_parte.
set local lock_timeout = '2s';

do $guarda$
begin
  if md5(pg_get_functiondef('public.fn_lote_cadastro_salvar(uuid, text, uuid, text, text, uuid[], boolean, boolean)'::regprocedure)) <> '951c3feb10bc32da155227b93b8fbacb'
     or md5(pg_get_functiondef('public._fn_lote_codigo(uuid, uuid, uuid, integer)'::regprocedure)) <> 'a1bf93cff5ae12e717d44db6bd04425e'
     or md5(pg_get_functiondef('public.fn_lote_salvar(uuid, uuid, jsonb, integer, text, boolean)'::regprocedure)) <> '474f127bad9d6763fd66420243d9567b' then
    raise exception 'LOTES-04: uma função do lote mudou desde a leitura (md5 diferente); nada gravado';
  end if;
end
$guarda$;

/* 1 — a ordem nova: ATIVIDADE-CATEGORIA-RAÇA-NN */
create or replace function public._fn_lote_codigo(p_categoria uuid, p_raca uuid, p_atividade uuid, p_numero integer)
returns text language sql stable security definer set search_path to 'pg_catalog', 'public' as $$
  select (select sigla from public.rebanho_lote_cadastros where id = p_atividade) || '-' ||
         (select sigla from public.rebanho_lote_cadastros where id = p_categoria) || '-' ||
         (select sigla from public.rebanho_lote_cadastros where id = p_raca) || '-' || lpad(p_numero::text, 2, '0')
$$;
revoke all on function public._fn_lote_codigo(uuid, uuid, uuid, integer) from public, anon;

/* 2 — o código com UMA parte trocada (k = 1 atividade, 2 categoria, 3 raça), só se a parte for a sigla velha */
create or replace function public._fn_lote_codigo_troca_parte(p_codigo text, p_k integer, p_de text, p_para text)
returns text language sql immutable set search_path to 'pg_catalog', 'public' as $$
  select case when split_part(p_codigo, '-', p_k) = p_de
              then array_to_string((string_to_array(p_codigo, '-'))[1:p_k - 1] || p_para || (string_to_array(p_codigo, '-'))[p_k + 1:], '-')
              else p_codigo end
$$;
revoke all on function public._fn_lote_codigo_troca_parte(text, integer, text, text) from public, anon;

create or replace function public.fn_lote_cadastro_salvar(p_cliente uuid, p_tipo text, p_id uuid, p_sigla text, p_nome text,
  p_categorias uuid[] default '{}', p_ativo boolean default true, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare
  v_old public.rebanho_lote_cadastros%rowtype;
  v_sigla text := nullif(upper(btrim(coalesce(p_sigla, ''))), '');
  v_nome text := btrim(coalesce(p_nome, ''));
  v_cats uuid[] := coalesce(p_categorias, '{}');
  v_usos integer := 0; v_dup text; v_id uuid;
  v_k integer; v_troca boolean := false; v_set jsonb := '[]'::jsonb; v_lotes jsonb := '[]'::jsonb; v_repetido text;
begin
  perform public._fn_exigir_tenant_das_linhas(array[p_cliente]);
  if p_tipo is null or p_tipo not in ('categoria', 'raca', 'atividade', 'sistema', 'programa', 'destino') then
    raise exception using errcode = 'P0001', message = 'Cadastro desconhecido. Nada foi gravado.';
  end if;
  if p_tipo in ('sistema', 'programa', 'destino') then v_sigla := null; v_cats := '{}'; end if;
  if p_tipo in ('raca', 'atividade') then v_cats := '{}'; end if;
  if p_tipo in ('categoria', 'raca', 'atividade') and (v_sigla is null or v_sigla !~ '^[A-Z0-9]{2,3}$') then
    raise exception using errcode = 'P0001', message = 'A sigla precisa de 2 ou 3 letras ou números.';
  end if;
  if v_nome = '' then raise exception using errcode = 'P0001', message = 'Falta o nome.'; end if;
  if length(v_nome) > 32 then raise exception using errcode = 'P0001', message = 'O nome passa de 32 letras.'; end if;
  if p_tipo = 'categoria' and cardinality(v_cats) = 0 then
    raise exception using errcode = 'P0001', message = 'Marque pelo menos uma categoria do rebanho.';
  end if;
  if exists (select 1 from unnest(v_cats) c where not exists (select 1 from public.categorias_rebanho r where r.id = c)) then
    raise exception using errcode = 'P0001', message = 'Uma das categorias do rebanho não existe. Escolha de novo.';
  end if;

  if p_id is not null then
    select * into v_old from public.rebanho_lote_cadastros where id = p_id for update;
    if v_old.id is null or v_old.cliente_id <> p_cliente or v_old.tipo <> p_tipo then
      raise exception using errcode = '42501', message = 'sem acesso a este registro';
    end if;
    select count(*) into v_usos from public.rebanho_lotes l
     where p_id in (l.categoria_id, l.raca_id, l.atividade_id, l.sistema_id, l.programa_id, l.destino_id);
    if v_usos > 0 and not coalesce(p_ativo, true) then
      raise exception using errcode = 'P0001', message = format('%s lote%s usa%s este cadastro: ele não pode sair da lista.', v_usos,
                         case when v_usos > 1 then 's' else '' end, case when v_usos > 1 then 'm' else '' end);
    end if;
    /* LOTES-04 — sigla em uso pode mudar: os códigos dos lotes que a usam mudam junto (a parte do tipo na ordem ATIV-CAT-RAÇA) */
    v_k := case p_tipo when 'atividade' then 1 when 'categoria' then 2 when 'raca' then 3 end;
    v_troca := v_k is not null and v_usos > 0 and v_old.sigla is distinct from v_sigla;
  end if;

  if coalesce(p_ativo, true) then
    select format('A sigla %s já é “%s”. Escolha outra ou use a existente.', c.sigla, c.nome) into v_dup
      from public.rebanho_lote_cadastros c
     where c.cliente_id = p_cliente and c.tipo = p_tipo and c.ativo and c.id is distinct from p_id and v_sigla is not null and c.sigla = v_sigla;
    if v_dup is null then
      select format('“%s” já está no cadastro.', c.nome) into v_dup
        from public.rebanho_lote_cadastros c
       where c.cliente_id = p_cliente and c.tipo = p_tipo and c.ativo and c.id is distinct from p_id and lower(c.nome) = lower(v_nome);
    end if;
    if v_dup is not null then raise exception using errcode = 'P0001', message = v_dup; end if;
  end if;

  if v_troca then
    /* os lotes que mudam de código (todos os que usam o cadastro na posição do tipo, de qualquer situação); o código de antes vai para
       `codigos_antigos` (a busca acha pelo velho; o novo sai de lá, se estava); em jsonb, sem tabela temporária */
    select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'fazenda_id', l.fazenda_id, 'situacao', l.situacao, 'antes', l.codigo,
             'depois', public._fn_lote_codigo_troca_parte(l.codigo, v_k, v_old.sigla, v_sigla),
             'antigos_depois', to_jsonb(array_remove(array_remove(l.codigos_antigos, l.codigo) || l.codigo,
                                                     public._fn_lote_codigo_troca_parte(l.codigo, v_k, v_old.sigla, v_sigla))))), '[]'::jsonb)
      into v_set
      from public.rebanho_lotes l
     where l.cliente_id = p_cliente
       and p_id = case v_k when 1 then l.atividade_id when 2 then l.categoria_id else l.raca_id end;

    /* código repetido na mesma fazenda (entre os vivos): recusa com quais */
    with t as (select * from jsonb_to_recordset(v_set) as r(id uuid, fazenda_id uuid, situacao text, antes text, depois text))
    select string_agg(distinct t.antes || ' → ' || t.depois, ' · ') into v_repetido
      from t
     where t.situacao <> 'cancelado'
       and (exists (select 1 from public.rebanho_lotes x where x.fazenda_id = t.fazenda_id and x.codigo = t.depois and x.situacao <> 'cancelado'
                       and not exists (select 1 from t y where y.id = x.id))
            or exists (select 1 from t y where y.id <> t.id and y.fazenda_id = t.fazenda_id and y.depois = t.depois and y.situacao <> 'cancelado'));
    if v_repetido is not null then
      raise exception using errcode = 'P0001', message = format('Código repetido: %s. Nada foi gravado.', v_repetido);
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'antes', r.antes, 'depois', r.depois) order by r.antes), '[]'::jsonb) into v_lotes
      from jsonb_to_recordset(v_set) as r(id uuid, antes text, depois text) where r.antes <> r.depois;
  end if;

  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'id', p_id, 'sigla', v_sigla, 'nome', v_nome, 'usos', v_usos, 'lotes', v_lotes);
  end if;
  perform set_config('app.lote_escritor', '1', true);
  if v_troca then perform set_config('app.motivo', format('sigla %s → %s', v_old.sigla, v_sigla), true); end if;
  if p_id is null then
    insert into public.rebanho_lote_cadastros (cliente_id, tipo, sigla, nome, categorias_rebanho, ordem)
    values (p_cliente, p_tipo, v_sigla, v_nome, v_cats,
            coalesce((select max(ordem) + 10 from public.rebanho_lote_cadastros where cliente_id = p_cliente and tipo = p_tipo), 10))
    returning id into v_id;
  else
    update public.rebanho_lote_cadastros set sigla = v_sigla, nome = v_nome, categorias_rebanho = v_cats, ativo = coalesce(p_ativo, true),
           atualizado_em = now()
     where id = p_id;
    v_id := p_id;
  end if;
  if v_troca then
    update public.rebanho_lotes l set codigo = t.depois, codigos_antigos = t.antigos_depois, atualizado_em = now()
      from jsonb_to_recordset(v_set) as t(id uuid, depois text, antigos_depois text[])
     where t.id = l.id and (l.codigo <> t.depois or l.codigos_antigos <> t.antigos_depois);
    perform set_config('app.motivo', '', true);
  end if;
  perform set_config('app.lote_escritor', '', true);
  return jsonb_build_object('ok', true, 'simulado', false, 'id', v_id, 'sigla', v_sigla, 'nome', v_nome, 'usos', v_usos, 'lotes', v_lotes);
end $$;
revoke all on function public.fn_lote_cadastro_salvar(uuid, text, uuid, text, text, uuid[], boolean, boolean) from public, anon;
grant execute on function public.fn_lote_cadastro_salvar(uuid, text, uuid, text, text, uuid[], boolean, boolean) to authenticated;

/* 3 — o nº do lote se edita: qualquer nº de 1 a 99 livre na combinação da fazenda (era só o próximo livre ou um código que já foi dele) */
do $remendo$
declare
  v_def text;
  v_de constant text := $de$  if p_campos ? 'numero' then
    n.numero := (p_campos->>'numero')::integer;
    if p_id is null or not (public._fn_lote_codigo(n.categoria_id, n.raca_id, n.atividade_id, n.numero) = any (o.codigos_antigos || o.codigo)) then
      raise exception using errcode = 'P0001', message = 'O número sai sozinho: o próximo livre da combinação na fazenda.';
    end if;$de$;
  v_para constant text := $para$  if p_campos ? 'numero' then
    /* LOTES-04 — o nº se edita: 1 a 99, livre na combinação da fazenda (os cancelados contam, como no índice rebanho_lotes_numero_unico) */
    v_txt := nullif(btrim(coalesce(p_campos->>'numero', '')), '');
    if v_txt is null or v_txt !~ '^[0-9]{1,2}$' or v_txt::integer < 1 then
      raise exception using errcode = 'P0001', message = 'O nº vai de 1 a 99.';
    end if;
    n.numero := v_txt::integer;
    select x.codigo into v_txt from public.rebanho_lotes x
     where x.fazenda_id = n.fazenda_id and x.categoria_id = n.categoria_id and x.raca_id = n.raca_id and x.atividade_id = n.atividade_id
       and x.numero = n.numero and x.id is distinct from p_id limit 1;
    if v_txt is not null then
      raise exception using errcode = 'P0001', message = format('O nº %s já é do lote %s. Escolha outro.', lpad(n.numero::text, 2, '0'), v_txt);
    end if;$para$;
begin
  select pg_get_functiondef('public.fn_lote_salvar(uuid, uuid, jsonb, integer, text, boolean)'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'LOTES-04: o trecho do nº não está uma vez só no fn_lote_salvar; nada gravado';
  end if;
  execute replace(v_def, v_de, v_para);
end
$remendo$;
