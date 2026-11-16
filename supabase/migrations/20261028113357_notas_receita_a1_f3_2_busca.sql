-- NOTAS-RECEITA-A1-01 · F3.2 — o que a borda `fiscal-dfe-buscar` precisa do banco (OK do Chat 16/11 14:43: "a borda confere a cadeia ICP antes
-- de chamar e grava o resultado na trilha"):
--   (1) `fn_fiscal_dfe_credencial`: o certificado ATIVO e válido do titular — onde está o .pfx cifrado, a senha (do Vault), a impressão digital
--       guardada (a borda confere que o arquivo aberto é ESTE) e a UF do titular. Só service_role: quem abre o certificado é a borda;
--   (2) a trilha da busca (`fiscal_dfe_buscas`) ganha `certificado_id` e `detalhe` (a cadeia conferida, o ambiente, o xMotivo, o erro);
--   (3) `fn_fiscal_dfe_registrar` ganha os dois campos (mesmo corpo da 113350 fora isso);
--   (4) `fn_fiscal_dfe_pedido_fechar`: fecha o pedido SEM resposta da Receita (cadeia/certificado recusados → nem chamou; conexão caiu ou a
--       resposta não se leu → sem resposta), com a linha na trilha; o NSU e o relógio NÃO andam.
-- ⚠ Nenhum dado de cliente muda. Nada aqui chama a Receita.
set local lock_timeout = '2s';

do $$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fn_fiscal_dfe_registrar(uuid,text,bigint,bigint,timestamptz,jsonb,jsonb)'::regprocedure)
     <> '0deb34a7a348ec3a3cd1ea91ee1a53f5' then
    raise exception 'fn_fiscal_dfe_registrar mudou desde a 113350: PARE e confira.';
  end if;
end $$;

-- ── (2) a trilha ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.fiscal_dfe_buscas
  add column certificado_id uuid references public.fiscal_certificados(id),
  add column detalhe jsonb;

-- ── (1) a credencial para a borda ────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_fiscal_dfe_credencial(p_titular_id uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  t public.fiscal_titulares;
  c public.fiscal_certificados;
  co public.fiscal_certificados_cofre;
  v_senha text;
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null then raise exception using errcode = 'P0001', message = 'Produtor não encontrado.'; end if;
  select * into c from public.fiscal_certificados
   where titular_id = t.id and situacao = 'ativo' order by enviado_em desc limit 1;
  if c.id is null then raise exception using errcode = 'P0001', message = 'Este produtor não tem certificado A1 ativo.'; end if;
  if c.valido_ate <= now() then raise exception using errcode = 'P0001', message = 'O certificado deste produtor venceu: suba o novo.'; end if;
  if c.documento <> t.documento then raise exception using errcode = 'P0001', message = 'O certificado é de outro CPF/CNPJ, não deste produtor.'; end if;
  select * into co from public.fiscal_certificados_cofre where certificado_id = c.id;
  if co.objeto is null or co.segredo_id is null then raise exception using errcode = 'P0001', message = 'O cofre deste certificado está vazio.'; end if;
  select decrypted_secret into v_senha from vault.decrypted_secrets where id = co.segredo_id;
  if v_senha is null then raise exception using errcode = 'P0001', message = 'A senha do certificado não está no cofre.'; end if;
  return jsonb_build_object('certificado_id', c.id, 'cliente_id', t.cliente_id, 'documento', t.documento, 'uf', t.uf, 'objeto', co.objeto,
    'senha', v_senha, 'impressao_digital', c.impressao_digital, 'valido_ate', c.valido_ate);
end $$;

-- ── (3) registrar UMA resposta (corpo da 113350 + certificado_id + detalhe na trilha) ────────────────────────────────────────────
drop function public.fn_fiscal_dfe_registrar(uuid, text, bigint, bigint, timestamptz, jsonb, jsonb);
create function public.fn_fiscal_dfe_registrar(
  p_titular_id uuid, p_cstat text, p_ult_nsu bigint, p_max_nsu bigint, p_nao_antes_de timestamptz,
  p_documentos jsonb default '[]'::jsonb, p_eventos jsonb default '[]'::jsonb,
  p_certificado_id uuid default null, p_detalhe jsonb default null)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  t public.fiscal_titulares;
  c public.fiscal_dfe_controle;
  d jsonb; e jsonb;
  v_novos int := 0; v_atualizados int := 0; v_ev int := 0; v_ev_sem int := 0;
  v_ins boolean; v_ult bigint; v_busca bigint;
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
  if p_certificado_id is not null and not exists (select 1 from public.fiscal_certificados where id = p_certificado_id and titular_id = t.id) then
    raise exception using errcode = 'P0001', message = 'O certificado não é deste produtor. Nada foi gravado.';
  end if;
  if p_detalhe is not null and jsonb_typeof(p_detalhe) <> 'object' then
    raise exception using errcode = 'P0001', message = 'Detalhe fora do formato. Nada foi gravado.';
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
  insert into public.fiscal_dfe_buscas (cliente_id, titular_id, cstat, ult_nsu_antes, ult_nsu_depois, max_nsu, documentos, novos, eventos, via,
    certificado_id, detalhe)
  values (t.cliente_id, t.id, p_cstat, c.ult_nsu, v_ult, p_max_nsu, jsonb_array_length(coalesce(p_documentos, '[]')), v_novos, v_ev,
    'borda:fiscal-dfe-buscar', p_certificado_id, p_detalhe)
  returning id into v_busca;
  return jsonb_build_object('busca_id', v_busca, 'novos', v_novos, 'atualizados', v_atualizados, 'eventos', v_ev, 'eventos_sem_nota', v_ev_sem,
    'ult_nsu', v_ult);
end $$;

-- ── (4) fechar o pedido sem resposta da Receita ──────────────────────────────────────────────────────────────────────────────────
-- p_motivo: 'cadeia' | 'certificado' (a borda recusou ANTES de chamar) · 'conexao' | 'leitura' (chamou e não houve resposta legível)
create or replace function public.fn_fiscal_dfe_pedido_fechar(p_titular_id uuid, p_motivo text, p_certificado_id uuid default null,
  p_detalhe jsonb default null)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  t public.fiscal_titulares;
  c public.fiscal_dfe_controle;
  v_busca bigint;
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null then raise exception using errcode = 'P0001', message = 'Produtor não encontrado.'; end if;
  if coalesce(p_motivo, '') not in ('cadeia', 'certificado', 'conexao', 'leitura') then
    raise exception using errcode = 'P0001', message = 'Motivo inválido.';
  end if;
  if p_detalhe is not null and jsonb_typeof(p_detalhe) <> 'object' then raise exception using errcode = 'P0001', message = 'Detalhe fora do formato.'; end if;
  select * into c from public.fiscal_dfe_controle where titular_id = t.id for update;
  if c.titular_id is null or c.em_andamento_desde is null then
    raise exception using errcode = 'P0001', message = 'Não há pedido aberto para este produtor.';
  end if;
  update public.fiscal_dfe_controle set em_andamento_desde = null where titular_id = t.id;
  insert into public.fiscal_dfe_buscas (cliente_id, titular_id, cstat, ult_nsu_antes, ult_nsu_depois, max_nsu, via, certificado_id, detalhe)
  values (t.cliente_id, t.id, case when p_motivo in ('cadeia', 'certificado') then 'nao_chamou' else 'sem_resposta' end, c.ult_nsu, c.ult_nsu,
    c.max_nsu, 'borda:fiscal-dfe-buscar', p_certificado_id, coalesce(p_detalhe, '{}'::jsonb) || jsonb_build_object('motivo', p_motivo))
  returning id into v_busca;
  return jsonb_build_object('busca_id', v_busca, 'motivo', p_motivo);
end $$;

revoke all on function public.fn_fiscal_dfe_credencial(uuid) from public, anon, authenticated;
revoke all on function public.fn_fiscal_dfe_registrar(uuid, text, bigint, bigint, timestamptz, jsonb, jsonb, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fn_fiscal_dfe_pedido_fechar(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_fiscal_dfe_credencial(uuid) to service_role;
grant execute on function public.fn_fiscal_dfe_registrar(uuid, text, bigint, bigint, timestamptz, jsonb, jsonb, uuid, jsonb) to service_role;
grant execute on function public.fn_fiscal_dfe_pedido_fechar(uuid, text, uuid, jsonb) to service_role;
