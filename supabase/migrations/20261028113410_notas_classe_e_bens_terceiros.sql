-- NOTAS-RECEITA-SEM-LANCAMENTO-01 (Gabriel 18/11, proposta aprovada) — lote 25.
-- (1) fn_notas_atributos_fiscais: o que a CLASSE da nota precisa (CFOPs dos itens, tpNF, natOp) e as notas que ela CITA (refNFe), lido do XML que a busca já guardou, para a lista
--     inteira numa pergunta só. A REGRA da classe mora numa função só da tela (`classeDaNota`); o banco só extrai.
-- (2) patrimonio_bens_terceiros: o bem que está COM o cliente mas é de OUTRO (comodato, demonstração, conserto), vindo da nota de remessa — uma
--     linha por item da nota; controla o que tem de voltar. NÃO é patrimônio do cliente (fica fora de patrimonio_bens, da depreciação e do valor).
-- (3) fn_bem_terceiro_registrar: registra a partir da nota (prévia = p_simular), recusa nota que não é remessa de bem e nota já registrada.
-- Nada se apaga: cancelar é marcar (cancelado_em/por/motivo), como o resto do Patrimônio.

create or replace function public.fn_notas_atributos_fiscais(p_cliente uuid, p_chaves text[])
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_ret jsonb;
begin
  if p_cliente is null or not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  if coalesce(array_length(p_chaves, 1), 0) > 2000 then
    raise exception using errcode = 'P0001', message = 'Chaves demais (até 2000).';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'chave', r.chave,
           'cfops', to_jsonb(array(select distinct m[1] from regexp_matches(r.xml, '<CFOP>(\d{4})</CFOP>', 'g') m order by 1)),
           'tpnf', (regexp_match(r.xml, '<tpNF>(\d)</tpNF>'))[1],
           'natop', (regexp_match(r.xml, '<natOp>([^<]*)</natOp>'))[1],
           -- as notas que ESTA nota cita (NFref/refNFe): a remessa de entrega futura aponta o faturamento, a devolução a original
           'refs', to_jsonb(array(select m[1] from regexp_matches(r.xml, '<refNFe>(\d{44})</refNFe>', 'g') m)))), '[]'::jsonb)
    into v_ret
    from public.fiscal_dfe_recebidos r
   where r.cliente_id = p_cliente and r.xml is not null and r.chave = any (p_chaves);
  return v_ret;
end $function$;
revoke all on function public.fn_notas_atributos_fiscais(uuid, text[]) from public, anon;
grant execute on function public.fn_notas_atributos_fiscais(uuid, text[]) to authenticated;

create table public.patrimonio_bens_terceiros (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null,
  motivo text not null check (motivo in ('comodato', 'demonstracao', 'conserto')),
  descricao text not null,
  quantidade numeric,
  valor_referencia numeric,
  fornecedor_documento text,
  fornecedor_nome text,
  chave_remessa text not null check (chave_remessa ~ '^\d{44}$'),
  item_n integer not null,
  nf_remessa text,
  data_remessa date,
  previsao_devolucao date,
  chave_retorno text check (chave_retorno is null or chave_retorno ~ '^\d{44}$'),
  devolvido_em date,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  cancelado_em timestamptz,
  cancelado_por uuid,
  cancelado_motivo text
);
create unique index patrimonio_bens_terceiros_item_vivo on public.patrimonio_bens_terceiros (cliente_id, chave_remessa, item_n) where cancelado_em is null;
alter table public.patrimonio_bens_terceiros enable row level security;
create policy patrimonio_bens_terceiros_ler on public.patrimonio_bens_terceiros for select using (public.tenant_ok(cliente_id));
revoke all on table public.patrimonio_bens_terceiros from public, anon, authenticated;
grant select on table public.patrimonio_bens_terceiros to authenticated;
grant all on table public.patrimonio_bens_terceiros to service_role;

-- Registrar pela nota de remessa. p_simular = a prévia (nada grava). Recusas com a frase (P0001), nunca vazio.
create or replace function public.fn_bem_terceiro_registrar(p_cliente uuid, p_chave text, p_previsao_devolucao date default null,
  p_observacao text default null, p_simular boolean default true)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_xml text; v_emit text; v_nome text; v_emissao date; v_cfops text[]; v_motivo text; v_itens jsonb; v_chave text;
begin
  if p_cliente is null or not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  v_chave := regexp_replace(coalesce(p_chave, ''), '\D', '', 'g');
  select r.xml, r.emitente_documento, r.emitente_nome, r.emissao into v_xml, v_emit, v_nome, v_emissao
    from public.fiscal_dfe_recebidos r where r.cliente_id = p_cliente and r.chave = v_chave;
  if v_xml is null then
    raise exception using errcode = 'P0001', message = 'A nota não está na caixa da Receita com o XML completo.';
  end if;
  v_cfops := array(select distinct m[1] from regexp_matches(v_xml, '<CFOP>(\d{4})</CFOP>', 'g') m);
  v_motivo := case
    when v_cfops && array['5908','6908'] then 'comodato'
    when v_cfops && array['5912','6912','5913','6913'] then 'demonstracao'
    when v_cfops && array['5915','6915','5916','6916'] then 'conserto' end;
  if v_motivo is null then
    raise exception using errcode = 'P0001', message = 'Esta nota não é remessa de bem de terceiro (comodato, demonstração ou conserto).';
  end if;
  if exists (select 1 from public.patrimonio_bens_terceiros b where b.cliente_id = p_cliente and b.chave_remessa = v_chave and b.cancelado_em is null) then
    raise exception using errcode = 'P0001', message = 'Os bens desta nota já estão registrados.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'n', (regexp_match(d[1], 'nItem="(\d+)"'))[1]::int,
           'descricao', (regexp_match(d[1], '<xProd>([^<]*)</xProd>'))[1],
           'quantidade', nullif((regexp_match(d[1], '<qCom>([^<]*)</qCom>'))[1], '')::numeric,
           'valor', nullif((regexp_match(d[1], '<vProd>([^<]*)</vProd>'))[1], '')::numeric)
         order by (regexp_match(d[1], 'nItem="(\d+)"'))[1]::int), '[]'::jsonb)
    into v_itens
    from regexp_matches(v_xml, '(<det [^>]*>.*?</det>)', 'g') d;
  if jsonb_array_length(v_itens) = 0 then
    raise exception using errcode = 'P0001', message = 'Não li os itens da nota.';
  end if;
  if not coalesce(p_simular, true) then
    insert into public.patrimonio_bens_terceiros (cliente_id, motivo, descricao, quantidade, valor_referencia, fornecedor_documento, fornecedor_nome,
      chave_remessa, item_n, nf_remessa, data_remessa, previsao_devolucao, observacao, criado_por)
    select p_cliente, v_motivo, i->>'descricao', (i->>'quantidade')::numeric, (i->>'valor')::numeric, v_emit, v_nome,
           v_chave, (i->>'n')::int, ltrim(substr(v_chave, 26, 9), '0'), v_emissao, p_previsao_devolucao, left(p_observacao, 500), auth.uid()
      from jsonb_array_elements(v_itens) i;
  end if;
  return jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, true), 'motivo', v_motivo, 'fornecedor', v_nome,
    'fornecedor_documento', v_emit, 'nf', ltrim(substr(v_chave, 26, 9), '0'), 'data', v_emissao, 'itens', v_itens,
    'total', (select coalesce(sum((i->>'valor')::numeric), 0) from jsonb_array_elements(v_itens) i));
end $function$;
revoke all on function public.fn_bem_terceiro_registrar(uuid, text, date, text, boolean) from public, anon;
grant execute on function public.fn_bem_terceiro_registrar(uuid, text, date, text, boolean) to authenticated;
