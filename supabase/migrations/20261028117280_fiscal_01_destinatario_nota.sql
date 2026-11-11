-- FISCAL-01 · F1 · o destinatário na nota e o titular sugerido pelas notas (Gabriel 04/11: OK para A, B e C).
-- (A) nota_fiscal ganha dest_documento / dest_nome / dest_ie. O fn_nota_fiscal_gravar (ITENS-NOTA-01, do Code 2) passa a gravá-los em toda
--     nota: do payload (`destinatario`, que a NotaLida já tem, PDF e XML) e, sem ele, do próprio XML (<dest>). Patch guardado por md5:
--     só a declaração, o UPDATE e o INSERT mudam; regravar sem destinatário NÃO apaga o que já está gravado.
-- (B) fn_nota_fiscal_destinatario_pendentes lista as notas sem destinatário (com o arquivo, para a releitura do PDF; o XML já vem lido) e
--     fn_nota_fiscal_destinatario_preencher grava SÓ onde está vazio, com prévia e trilha (nunca sobrescreve).
-- (C) fn_fiscal_titulares_sugeridos: por fazenda, os destinatários das notas cuja IE é a IE da fazenda, com o nº de notas. Fazenda sem IE
--     ou sem nota com a IE dela = sem sugestão (sem chute). O % não vem da nota: é digitado na confirmação (fn_fiscal_fazenda_titulares_gravar).
set local lock_timeout = '2s';

alter table public.nota_fiscal
  add column dest_documento text check (dest_documento is null or dest_documento ~ '^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$'),
  add column dest_nome text,
  add column dest_ie text check (dest_ie is null or dest_ie ~ '^[0-9]{8,14}$');
comment on column public.nota_fiscal.dest_documento is 'FISCAL-01: CPF (11 dígitos) ou CNPJ (14: numérico ou alfanumérico, 12 posições 0-9/A-Z + 2 dígitos), sem pontuação, em maiúsculas, '
  'como lido da nota (o dígito não é conferido aqui).';
comment on column public.nota_fiscal.dest_ie is 'FISCAL-01: IE do destinatário, só dígitos (8 a 14). É ela que liga a nota à fazenda (fazenda_cadastros.ie).';

-- ── auxiliares (internas, fechadas) ────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._fn_nota_dest_normalizar(j jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog as $$
declare v_doc text; v_ie text;
begin
  v_doc := upper(regexp_replace(coalesce(j->>'documento', ''), '[^0-9A-Za-z]', '', 'g'));
  v_ie := regexp_replace(coalesce(j->>'ie', ''), '\D', '', 'g');
  return jsonb_build_object(
    'documento', case when v_doc ~ '^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$' then v_doc end,
    'nome', nullif(btrim(regexp_replace(coalesce(j->>'nome', ''), '\s+', ' ', 'g')), ''),
    'ie', case when length(v_ie) between 8 and 14 then v_ie end);
end $$;

create or replace function public._fn_nota_dest_do_xml(p_xml text)
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select case when d is null then null else jsonb_build_object(
    'documento', coalesce(substring(d from '<CNPJ>([0-9A-Z]+)</CNPJ>'), substring(d from '<CPF>([0-9]+)</CPF>')),
    'nome', replace(replace(replace(substring(d from '<xNome>(.*?)</xNome>'), '&amp;', '&'), '&lt;', '<'), '&gt;', '>'),
    'ie', substring(d from '<IE>([0-9]+)</IE>')) end
  from (select substring(p_xml from '<dest>(.*?)</dest>') d) x
$$;

-- o destinatário de um payload de nota: o que veio no `destinatario`; sem documento nem IE nele, o do XML (se o XML tiver um dos dois;
-- senão fica o que veio, nem que seja só o nome)
create or replace function public._fn_nota_dest_da_nota(p_nota jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog, public as $$
declare a jsonb := public._fn_nota_dest_normalizar(p_nota->'destinatario'); b jsonb;
begin
  if a->>'documento' is null and a->>'ie' is null then
    b := public._fn_nota_dest_normalizar(public._fn_nota_dest_do_xml(p_nota->>'xml_original'));
    if b->>'documento' is not null or b->>'ie' is not null then a := b; end if;
  end if;
  return a;
end $$;

revoke all on function public._fn_nota_dest_normalizar(jsonb) from public, anon, authenticated;
revoke all on function public._fn_nota_dest_do_xml(text) from public, anon, authenticated;
revoke all on function public._fn_nota_dest_da_nota(jsonb) from public, anon, authenticated;
grant execute on function public._fn_nota_dest_normalizar(jsonb), public._fn_nota_dest_do_xml(text), public._fn_nota_dest_da_nota(jsonb) to service_role;

-- ── (A) o gravador da nota passa a gravar o destinatário (patch guardado por md5; cada âncora casa 1 vez) ──────────────────────
do $patch$
declare v_def text := pg_get_functiondef('public.fn_nota_fiscal_gravar(uuid,jsonb,jsonb,boolean,uuid)'::regprocedure);
        a text[][] := array[
  array[E'  v_ruim int;\nbegin',
        E'  v_ruim int;\n  v_dest jsonb := public._fn_nota_dest_da_nota(p_nota);\nbegin'],
  array[E'lido_em = clock_timestamp(), lido_por = auth.uid(), operacao_id = p_operacao\n       where id = v_atual.id;',
        E'lido_em = clock_timestamp(), lido_por = auth.uid(), operacao_id = p_operacao,\n             dest_documento = coalesce(v_dest->>''documento'', dest_documento), dest_nome = coalesce(v_dest->>''nome'', dest_nome),\n             dest_ie = coalesce(v_dest->>''ie'', dest_ie)\n       where id = v_atual.id;'],
  array[E'totais, xml_original, soma_cent, nota_cent, lido_por, operacao_id)',
        E'totais, xml_original, soma_cent, nota_cent, lido_por, operacao_id, dest_documento, dest_nome, dest_ie)'],
  array[E'v_soma, v_nota,\n              auth.uid(), p_operacao)',
        E'v_soma, v_nota,\n              auth.uid(), p_operacao, v_dest->>''documento'', v_dest->>''nome'', v_dest->>''ie'')']];
        k int; n int;
begin
  if md5(v_def) <> 'a74c336c9d87035b204a001ffea92978' then
    raise exception 'fn_nota_fiscal_gravar mudou desde a leitura (md5 %): o patch não se aplica. Nada foi gravado.', md5(v_def);
  end if;
  for k in 1..array_length(a, 1) loop
    n := (length(v_def) - length(replace(v_def, a[k][1], ''))) / length(a[k][1]);
    if n <> 1 then raise exception 'âncora % do patch casou % vezes (esperado 1). Nada foi gravado.', k, n; end if;
    v_def := replace(v_def, a[k][1], a[k][2]);
  end loop;
  execute v_def;
end $patch$;

-- ── (B) as notas sem destinatário (para a releitura) ───────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_nota_fiscal_destinatario_pendentes(p_cliente uuid)
returns table (nota_id uuid, chave text, origem text, numero text, emissao date, xml_documento text, xml_nome text, xml_ie text,
               bucket text, caminho text)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
#variable_conflict use_column
begin
  if p_cliente is null or not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este cliente.';
  end if;
  return query
  select n.id, n.chave_acesso, n.origem, n.numero, n.emissao,
         x->>'documento', x->>'nome', x->>'ie', arq.bucket, arq.caminho
    from public.nota_fiscal n
    cross join lateral (select public._fn_nota_dest_normalizar(public._fn_nota_dest_do_xml(n.xml_original)) x) xx
    left join lateral (
      select d.bucket, d.caminho from (
        select 'fin-documentos'::text bucket, ld.url caminho, ld.uploaded_em em from public.financeiro_lancamento_documentos ld
         where ld.cliente_id = n.cliente_id and ld.chave_acesso = n.chave_acesso and not coalesce(ld.cancelado, false) and ld.url is not null
        union all
        select 'oc-documentos', od.url, od.uploaded_em from public.zoo_operacao_documentos od
         where od.cliente_id = n.cliente_id and od.chave_acesso = n.chave_acesso and not coalesce(od.cancelado, false) and od.url is not null) d
      order by (d.caminho ~* '\.pdf$') desc, d.em desc limit 1) arq on true
   where n.cliente_id = p_cliente and n.dest_documento is null and n.dest_nome is null and n.dest_ie is null
   order by n.emissao, n.chave_acesso;
end $$;

-- grava SÓ onde a nota não tem destinatário nenhum; um elemento só com a chave usa o XML guardado da nota
create or replace function public.fn_nota_fiscal_destinatario_preencher(p_cliente uuid, p_lista jsonb, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare e jsonb; v_chave text; n public.nota_fiscal; v jsonb; v_st text; v_linhas jsonb := '[]'::jsonb; v_vistas text[] := '{}';
        v_preenche int := 0; v_ja int := 0; v_sem int := 0; v_inv int := 0; v_rep int := 0; v_grav jsonb := '[]'::jsonb;
begin
  if p_cliente is null or not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este cliente.';
  end if;
  if p_lista is null or jsonb_typeof(p_lista) <> 'array' then raise exception 'Informe a lista de notas.'; end if;
  for e in select * from jsonb_array_elements(p_lista) loop
    v_chave := regexp_replace(coalesce(e->>'chave', ''), '\D', '', 'g');
    select * into n from public.nota_fiscal x where x.cliente_id = p_cliente and x.chave_acesso = v_chave;
    v := public._fn_nota_dest_normalizar(e);
    if v->>'documento' is null and v->>'ie' is null and n.id is not null then
      v := public._fn_nota_dest_normalizar(public._fn_nota_dest_do_xml(n.xml_original));
    end if;
    if v_chave = any (v_vistas) then v_st := 'repetida'; v_rep := v_rep + 1;
    elsif n.id is null then v_st := 'sem_nota'; v_sem := v_sem + 1;
    elsif n.dest_documento is not null or n.dest_nome is not null or n.dest_ie is not null then v_st := 'ja_tinha'; v_ja := v_ja + 1;
    elsif v->>'documento' is null and v->>'ie' is null then v_st := 'invalida'; v_inv := v_inv + 1;
    else
      v_st := 'preenche'; v_preenche := v_preenche + 1;
      v_grav := v_grav || jsonb_build_array(jsonb_build_object('nota_id', n.id, 'chave', v_chave) || v);
    end if;
    v_vistas := v_vistas || v_chave;
    v_linhas := v_linhas || jsonb_build_array(jsonb_build_object('chave', v_chave, 'status', v_st) || v);
  end loop;

  if not p_simular and v_preenche > 0 then
    update public.nota_fiscal x set dest_documento = g->>'documento', dest_nome = g->>'nome', dest_ie = g->>'ie'
      from jsonb_array_elements(v_grav) g
     where x.id = (g->>'nota_id')::uuid and x.cliente_id = p_cliente
       and x.dest_documento is null and x.dest_nome is null and x.dest_ie is null;
    insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, resumo, dados_novos, via)
    values (p_cliente, auth.uid(), 'fiscal', 'editou', 'nota_fiscal',
      format('Destinatário preenchido em %s nota(s) pela releitura', v_preenche), jsonb_build_object('notas', v_grav), public._fn_trilha_via());
  end if;
  return jsonb_build_object('simulado', p_simular, 'gravado', not p_simular and v_preenche > 0, 'preenche', v_preenche, 'ja_tinha', v_ja,
    'sem_nota', v_sem, 'invalida', v_inv, 'repetida', v_rep, 'linhas', v_linhas);
end $$;

-- ── (C) o titular sugerido de cada fazenda pelas notas ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_fiscal_titulares_sugeridos(p_cliente uuid)
returns table (fazenda_id uuid, fazenda text, fazenda_ie text, documento text, tipo text, documento_valido boolean, nome text, ie text,
               notas int, primeira date, ultima date, titular_id uuid, titular_nome text)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
#variable_conflict use_column
begin
  if p_cliente is null or not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este cliente.';
  end if;
  return query
  with faz as (
    select f.id, f.nome, f.status_operacional, nullif(regexp_replace(coalesce(c.ie, ''), '\D', '', 'g'), '') ie
      from public.fazendas f left join public.fazenda_cadastros c on c.fazenda_id = f.id and c.cliente_id = f.cliente_id
     where f.cliente_id = p_cliente),
  sug as (
    select fz.id fid, n.dest_documento doc, mode() within group (order by n.dest_nome) nm, count(*)::int qt,
           min(n.emissao) pri, max(n.emissao) ult
      from faz fz join public.nota_fiscal n on n.cliente_id = p_cliente and n.dest_ie = fz.ie and n.dest_documento is not null
     group by fz.id, n.dest_documento)
  select fz.id, fz.nome, fz.ie, s.doc,
         case length(s.doc) when 11 then 'PF' when 14 then 'PJ' end,
         case when s.doc is null then null else public._fn_cpf_cnpj_valido(s.doc) end,
         s.nm, case when s.doc is null then null else fz.ie end, coalesce(s.qt, 0), s.pri, s.ult, t.id, t.nome
    from faz fz
    left join sug s on s.fid = fz.id
    left join public.fiscal_titulares t on t.cliente_id = p_cliente and t.documento = s.doc
   where fz.status_operacional is distinct from 'inativa' or s.doc is not null
   order by fz.nome, coalesce(s.qt, 0) desc, s.doc;
end $$;

revoke all on function public.fn_nota_fiscal_destinatario_pendentes(uuid) from public, anon;
revoke all on function public.fn_nota_fiscal_destinatario_preencher(uuid, jsonb, boolean) from public, anon;
revoke all on function public.fn_fiscal_titulares_sugeridos(uuid) from public, anon;
grant execute on function public.fn_nota_fiscal_destinatario_pendentes(uuid) to authenticated, service_role;
grant execute on function public.fn_nota_fiscal_destinatario_preencher(uuid, jsonb, boolean) to authenticated, service_role;
grant execute on function public.fn_fiscal_titulares_sugeridos(uuid) to authenticated, service_role;
