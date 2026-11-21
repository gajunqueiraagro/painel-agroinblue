-- NOTA-DEMONSTRACAO-01 (Gabriel 19/11 08:03, FILA 08:06; print NF 7.891 Semecat "Ciclone", REMESSA PARA DEMONSTRAÇÃO) — lote 29.
-- (1) fn_notas_demonstracao_ligacoes: cada nota de DEMONSTRAÇÃO (5912/6912) ligada ao que veio DEPOIS do mesmo fornecedor (raiz do CNPJ,
--     até 180 dias): a COMPRA do bem (NF de venda: CFOP 51xx/61xx/54xx/64xx ou faturamento 5922/6922) ou o RETORNO (1913/2913/5913/6913).
--     A força da ligação: 'cita' (a nota cita a chave da demonstração) > 'item' (o mesmo código ou a mesma descrição de produto) >
--     'fornecedor' (só o mesmo fornecedor: a tela diz "confira"). Só LEITURA do XML que a busca guardou: comprado/devolvido é DERIVADO
--     das notas (nada grava; o bem de terceiro da demonstração aparece "comprado"/"devolvido" pela mesma regra).
-- (2) fn_bem_terceiro_registrar: o RETORNO (5913/6913) deixa de contar como demonstração — registrar é só a ida (5912/6912).
--     O resto da função é o do lote 25, verbatim.

create or replace function public.fn_notas_demonstracao_ligacoes(p_cliente uuid)
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
  with demo as (
    select r.chave, r.emissao, left(r.emitente_documento, 8) raiz,
           array(select upper(trim(m[1])) from regexp_matches(r.xml, '<cProd>([^<]*)</cProd>', 'g') m) cprods,
           array(select upper(trim(m[1])) from regexp_matches(r.xml, '<xProd>([^<]*)</xProd>', 'g') m) xprods
      from public.fiscal_dfe_recebidos r
     where r.cliente_id = p_cliente and r.xml ~ '<CFOP>(5912|6912)</CFOP>' and r.emitente_documento is not null
  ), cand as (
    select d.chave demo, c.chave nota, c.emissao,
           case when c.xml ~ '<CFOP>(5913|6913|1913|2913)</CFOP>' then 'retorno' else 'compra' end tipo,
           case when position(d.chave in c.xml) > 0 then 'cita'
                when exists (select 1 from regexp_matches(c.xml, '<cProd>([^<]*)</cProd>', 'g') m where upper(trim(m[1])) = any (d.cprods))
                  or exists (select 1 from regexp_matches(c.xml, '<xProd>([^<]*)</xProd>', 'g') m where upper(trim(m[1])) = any (d.xprods)) then 'item'
                else 'fornecedor' end por
      from demo d
      join public.fiscal_dfe_recebidos c
        on c.cliente_id = p_cliente and left(c.emitente_documento, 8) = d.raiz and c.chave <> d.chave and c.xml is not null
       and c.emissao >= d.emissao and c.emissao <= d.emissao + 180
       and c.situacao <> 'cancelado_na_sefaz'
     where c.xml ~ '<CFOP>(5913|6913|1913|2913)</CFOP>'
        or (c.xml ~ '<CFOP>([56][14]\d\d|5922|6922)</CFOP>' and c.xml !~ '<CFOP>(5912|6912)</CFOP>')
  ), melhor as (
    /* uma por demonstração: a mais forte; empate = a mais antiga (a 1ª que veio depois) */
    select distinct on (demo) demo, nota, tipo, por
      from cand order by demo, case por when 'cita' then 0 when 'item' then 1 else 2 end, emissao, nota
  )
  select coalesce(jsonb_agg(jsonb_build_object('demo', demo, 'nota', nota, 'tipo', tipo, 'por', por)), '[]'::jsonb) into v_ret from melhor;
  return v_ret;
end $function$;
revoke all on function public.fn_notas_demonstracao_ligacoes(uuid) from public, anon;
grant execute on function public.fn_notas_demonstracao_ligacoes(uuid) to authenticated;

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
    when v_cfops && array['5912','6912'] then 'demonstracao'
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
