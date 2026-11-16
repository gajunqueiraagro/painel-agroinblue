-- NOTAS-RECEITA-A1-01 · F3.1 — a PORTA do banco da busca na Receita (Distribuição DF-e). A borda `fiscal-dfe-buscar` (F3.2) chama, por titular:
--   (1) `fn_fiscal_dfe_pedido_abrir`: o RELÓGIO no banco — recusa antes do "não antes de" (137/656 = 1 h) e um pedido por titular por vez
--       (`em_andamento_desde`; pedido parado há mais de 5 min é dado como morto); devolve o ult_nsu de onde pedir;
--   (2) `fn_fiscal_dfe_registrar`: UMA resposta da SEFAZ numa transação — os documentos na caixa (`fiscal_dfe_recebidos`; chave repetida
--       ATUALIZA a situação pela precedência, nunca duplica e nunca rebaixa), os eventos (cancelamento 110111 marca a nota), o relógio
--       (o NSU nunca volta) e a trilha IMUTÁVEL da busca (`fiscal_dfe_buscas`).
-- As regras do relógio e a leitura do XML moram na borda (`_shared/dfe/relogioDfe.ts`, `distribuicaoDfe.ts`, provadas no vitest); aqui o
-- banco confere de novo o que não pode passar errado.
-- ⚠ SÓ service_role (quem tem o certificado é a borda). SECURITY INVOKER: o service_role já tem os grants das tabelas; nenhum
-- `authenticated` chama. Nenhum dado de cliente existente muda.
set local lock_timeout = '2s';

-- ── a trilha das buscas (IMUTÁVEL) ──────────────────────────────────────────────────────────────────────────────────────────────
create table public.fiscal_dfe_buscas (
  id bigserial primary key,
  cliente_id uuid not null references public.clientes(id),
  titular_id uuid not null references public.fiscal_titulares(id),
  em timestamptz not null default now(),
  cstat text not null,
  ult_nsu_antes bigint not null,
  ult_nsu_depois bigint not null,
  max_nsu bigint,
  documentos int not null default 0,
  novos int not null default 0,
  eventos int not null default 0,
  via text
);
create index fiscal_dfe_buscas_titular_ix on public.fiscal_dfe_buscas (titular_id, em desc);
create trigger trg_fiscal_dfe_buscas_imutavel before update or delete on public.fiscal_dfe_buscas
  for each row execute function public._fn_fiscal_trilha_imutavel();
alter table public.fiscal_dfe_buscas enable row level security;
create policy fiscal_dfe_buscas_ler on public.fiscal_dfe_buscas for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.fiscal_dfe_buscas from public, anon, authenticated;
grant select on public.fiscal_dfe_buscas to authenticated;
grant all on public.fiscal_dfe_buscas to service_role;
grant usage on sequence public.fiscal_dfe_buscas_id_seq to service_role;

-- ── (1) abrir o pedido: relógio + um por vez ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_fiscal_dfe_pedido_abrir(p_titular_id uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  t public.fiscal_titulares;
  c public.fiscal_dfe_controle;
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null then raise exception using errcode = 'P0001', message = 'Produtor não encontrado.'; end if;
  insert into public.fiscal_dfe_controle (titular_id, cliente_id) values (t.id, t.cliente_id) on conflict (titular_id) do nothing;
  select * into c from public.fiscal_dfe_controle where titular_id = t.id for update;
  if c.nao_antes_de is not null and c.nao_antes_de > now() then
    return jsonb_build_object('pode', false, 'motivo', 'espera', 'ate', c.nao_antes_de, 'ultimo_cstat', c.ultimo_cstat);
  end if;
  if c.em_andamento_desde is not null and c.em_andamento_desde > now() - interval '5 minutes' then
    return jsonb_build_object('pode', false, 'motivo', 'em_andamento', 'desde', c.em_andamento_desde);
  end if;
  update public.fiscal_dfe_controle set em_andamento_desde = now() where titular_id = t.id;
  return jsonb_build_object('pode', true, 'ult_nsu', c.ult_nsu, 'max_nsu', c.max_nsu, 'documento', t.documento);
end $$;

-- ── (2) registrar UMA resposta ──────────────────────────────────────────────────────────────────────────────────────────────────
-- p_documentos: [{ tipo:'nfe', chave, nsu, esquema, situacao:'resumo'|'xml'|'cancelado_na_sefaz', emitente_documento, emitente_nome,
--                 emissao:'aaaa-mm-dd', valor_cent, resumo:{…}, xml }]  (a `LinhaDaCaixa` da borda; nsu como texto ou número)
-- p_eventos:    [{ chave, nsu, esquema, tpEvento, descricao, em }]
create or replace function public.fn_fiscal_dfe_registrar(
  p_titular_id uuid, p_cstat text, p_ult_nsu bigint, p_max_nsu bigint, p_nao_antes_de timestamptz,
  p_documentos jsonb default '[]'::jsonb, p_eventos jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  t public.fiscal_titulares;
  c public.fiscal_dfe_controle;
  d jsonb; e jsonb;
  v_novos int := 0; v_atualizados int := 0; v_ev int := 0; v_ev_sem int := 0;
  v_ins boolean; v_ult bigint;
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null then raise exception using errcode = 'P0001', message = 'Produtor não encontrado. Nada foi gravado.'; end if;
  if p_cstat is null or p_cstat !~ '^\d{3}$' then raise exception using errcode = 'P0001', message = 'cStat inválido. Nada foi gravado.'; end if;
  if jsonb_typeof(coalesce(p_documentos, '[]')) <> 'array' or jsonb_typeof(coalesce(p_eventos, '[]')) <> 'array' then
    raise exception using errcode = 'P0001', message = 'Documentos ou eventos fora do formato. Nada foi gravado.';
  end if;
  if p_cstat <> '138' and jsonb_array_length(coalesce(p_documentos, '[]')) + jsonb_array_length(coalesce(p_eventos, '[]')) > 0 then
    raise exception using errcode = 'P0001', message = 'Só a resposta 138 traz documentos. Nada foi gravado.';
  end if;
  select * into c from public.fiscal_dfe_controle where titular_id = t.id for update;
  if c.titular_id is null then raise exception using errcode = 'P0001', message = 'Pedido não aberto para este produtor. Nada foi gravado.'; end if;

  for d in select * from jsonb_array_elements(coalesce(p_documentos, '[]')) loop
    if coalesce(d->>'tipo', 'nfe') <> 'nfe' or coalesce(d->>'situacao', '') not in ('resumo', 'xml', 'cancelado_na_sefaz') then
      raise exception using errcode = 'P0001', message = format('Documento %s fora do formato. Nada foi gravado.', coalesce(d->>'chave', '?'));
    end if;
    insert into public.fiscal_dfe_recebidos as r (cliente_id, titular_id, tipo, chave, nsu, esquema, situacao, emitente_documento,
      emitente_nome, emissao, valor_cent, resumo, xml)
    values (t.cliente_id, t.id, 'nfe', d->>'chave', (d->>'nsu')::bigint, d->>'esquema', d->>'situacao', d->>'emitente_documento',
      d->>'emitente_nome', (d->>'emissao')::date, (d->>'valor_cent')::bigint, d->'resumo', d->>'xml')
    on conflict (cliente_id, chave) do update set
      -- precedência: importado/ignorado/cancelado ficam; cancelado chega por cima de resumo/manifestado/xml; xml sobe resumo/manifestado
      situacao = case
        when r.situacao in ('importado', 'ignorado', 'cancelado_na_sefaz') then r.situacao
        when excluded.situacao = 'cancelado_na_sefaz' then 'cancelado_na_sefaz'
        when excluded.situacao = 'xml' then 'xml'
        else r.situacao end,
      xml = coalesce(r.xml, excluded.xml),
      esquema = case when excluded.xml is not null and r.xml is null then excluded.esquema else r.esquema end,
      nsu = coalesce(r.nsu, excluded.nsu),
      emitente_documento = coalesce(r.emitente_documento, excluded.emitente_documento),
      emitente_nome = coalesce(r.emitente_nome, excluded.emitente_nome),
      emissao = coalesce(r.emissao, excluded.emissao),
      valor_cent = coalesce(r.valor_cent, excluded.valor_cent),
      resumo = coalesce(r.resumo, '{}'::jsonb) || coalesce(excluded.resumo, '{}'::jsonb),
      atualizado_em = now()
    returning (xmax = 0) into v_ins;
    if v_ins then v_novos := v_novos + 1; else v_atualizados := v_atualizados + 1; end if;
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p_eventos, '[]')) loop
    if coalesce(e->>'chave', '') !~ '^\d{44}$' or coalesce(e->>'tpEvento', '') !~ '^\d{6}$' then
      raise exception using errcode = 'P0001', message = 'Evento fora do formato. Nada foi gravado.';
    end if;
    update public.fiscal_dfe_recebidos r set
      situacao = case when e->>'tpEvento' = '110111' and r.situacao in ('resumo', 'manifestado', 'xml') then 'cancelado_na_sefaz' else r.situacao end,
      resumo = coalesce(r.resumo, '{}'::jsonb) || jsonb_build_object('eventos',
        coalesce(r.resumo->'eventos', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('tpEvento', e->>'tpEvento', 'descricao', e->>'descricao',
          'em', e->>'em', 'nsu', e->>'nsu'))),
      atualizado_em = now()
    where r.cliente_id = t.cliente_id and r.chave = e->>'chave';
    if found then v_ev := v_ev + 1; else v_ev_sem := v_ev_sem + 1; end if;
  end loop;

  -- o relógio: o NSU nunca volta; o pedido fecha
  v_ult := greatest(c.ult_nsu, coalesce(p_ult_nsu, c.ult_nsu));
  update public.fiscal_dfe_controle set ult_nsu = v_ult, max_nsu = greatest(coalesce(p_max_nsu, c.max_nsu, v_ult), v_ult),
    nao_antes_de = p_nao_antes_de, ultimo_cstat = p_cstat, ultima_busca_em = now(), em_andamento_desde = null
  where titular_id = t.id;
  insert into public.fiscal_dfe_buscas (cliente_id, titular_id, cstat, ult_nsu_antes, ult_nsu_depois, max_nsu, documentos, novos, eventos, via)
  values (t.cliente_id, t.id, p_cstat, c.ult_nsu, v_ult, p_max_nsu, jsonb_array_length(coalesce(p_documentos, '[]')), v_novos, v_ev,
    'borda:fiscal-dfe-buscar');
  return jsonb_build_object('novos', v_novos, 'atualizados', v_atualizados, 'eventos', v_ev, 'eventos_sem_nota', v_ev_sem, 'ult_nsu', v_ult);
end $$;

revoke all on function public.fn_fiscal_dfe_pedido_abrir(uuid) from public, anon, authenticated;
revoke all on function public.fn_fiscal_dfe_registrar(uuid, text, bigint, bigint, timestamptz, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.fn_fiscal_dfe_pedido_abrir(uuid) to service_role;
grant execute on function public.fn_fiscal_dfe_registrar(uuid, text, bigint, bigint, timestamptz, jsonb, jsonb) to service_role;
