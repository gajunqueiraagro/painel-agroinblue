-- AGRI-MANDIOCA-MIG-01: carga de mandioca (entrega direta, paga por rendimento)
--
-- ⚠ JA APLICADA NO PROTO (16/09, GO do Gabriel). E' REGISTRO HISTORICO; nao se reaplica.
-- ⚠ A DDL VEIO DO ARQUITETO, byte a byte, e foi CONFERIDA contra o catalogo: as 6 colunas
--   (`local_estoque_id` agora nulavel, mais `toneladas`, `desconto_kg`, `rendimento_g`,
--   `preco_g`, `industria_id`), a tabela filha com `papel` sob CHECK, e as 4 policies de tenant
--   pelo NOME. As funcoes vieram de `pg_get_functiondef`, cada uma conferida por md5 do corpo:
--   registrar 8e04a200a40fafd3b5b9ef313db7405a (6.486), corrigir af8f482bdb4e6fc0a485e7dc67df48cf
--   (597), cancelar 2b2ec10548ebd1c61011b4ebbfded565 (1.362).
--
-- ⚠ `local_estoque_id` PERDE O NOT NULL, e e' a linha mais importante da DDL: mandioca
--   industrial NAO ESTOCA — colheita, entrega e venda sao o mesmo ato. Obrigar um local seria
--   pedir que o operador invente um galpao por onde o grao nunca passou.
-- ⚠ `agri_colheita_lancamentos` E' O ELO, e ele existe para o cancelamento em cascata: sem
--   saber QUAIS lancamentos nasceram de uma carga, corrigir a carga deixaria os antigos vivos.
--   O `papel` diz o que cada um e' — e e' por ele que o ICMS sabe que ja' foi lancado naquela NF.
-- ⚠ AS POLICIES DA FILHA FILTRAM PELO PAI: ela nao tem `cliente_id` proprio, e `tenant_ok` recebe
--   o do `agri_colheita`. E' o mesmo padrao das outras 10 filhas do ACESSOS-01.

alter table public.agri_colheita alter column local_estoque_id drop not null;
alter table public.agri_colheita
  add column if not exists toneladas numeric,
  add column if not exists desconto_kg numeric,
  add column if not exists rendimento_g integer,
  add column if not exists preco_g numeric,
  add column if not exists industria_id uuid references public.financeiro_fornecedores(id);
create table if not exists public.agri_colheita_lancamentos (
  colheita_id uuid not null references public.agri_colheita(id),
  lancamento_id uuid not null references public.financeiro_lancamentos_v2(id),
  papel text not null check (papel in ('venda','icms','funrural','arranquio','frete','carregamento')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (colheita_id, lancamento_id)
);
alter table public.agri_colheita_lancamentos enable row level security;
create policy agri_colheita_lancamentos_select_tenant on public.agri_colheita_lancamentos for select to authenticated using (public.tenant_ok((select c.cliente_id from public.agri_colheita c where c.id = colheita_id)));
create policy agri_colheita_lancamentos_insert_tenant on public.agri_colheita_lancamentos for insert to authenticated with check (public.tenant_ok((select c.cliente_id from public.agri_colheita c where c.id = colheita_id)));
create policy agri_colheita_lancamentos_update_tenant on public.agri_colheita_lancamentos for update to authenticated using (public.tenant_ok((select c.cliente_id from public.agri_colheita c where c.id = colheita_id))) with check (public.tenant_ok((select c.cliente_id from public.agri_colheita c where c.id = colheita_id)));
create policy agri_colheita_lancamentos_delete_tenant on public.agri_colheita_lancamentos for delete to authenticated using (public.tenant_ok((select c.cliente_id from public.agri_colheita c where c.id = colheita_id)));

CREATE OR REPLACE FUNCTION public.agri_carga_mandioca_registrar(p_cliente uuid, p_safra_area_id uuid, p_data date, p_industria_id uuid, p_nf text, p_ticket text, p_peso_bruto_kg numeric, p_desconto_kg numeric, p_rendimento_g integer, p_preco_g numeric, p_servicos jsonb, p_icms numeric, p_funrural numeric, p_observacao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_area record; v_liq numeric; v_t numeric; v_valor numeric; v_col uuid; v_uid uuid := coalesce(auth.uid(), '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e'); v_ids uuid[] := '{}'; v_id uuid; v_s jsonb; v_plano uuid; v_papel text; v_desc text; v_forn text; v_ind text; v_serv_total numeric := 0; v_icms_ja boolean; v_tstr text;
  c_venda constant uuid := '43b81bba-4136-4d8e-aee0-a8aaf1521dc0'; c_imp constant uuid := 'b451681a-c29e-4efe-a145-30a9950c6f5c'; c_frete constant uuid := '9c350708-9717-4ab9-adf4-09b25ccb024c'; c_colh constant uuid := 'dece8dbe-a699-4ddb-ab28-a61b43a7d52f';
begin
  select a.*, s.escopo_negocio, p.fazenda_id into v_area from agri_safra_area a join financeiro_safras s on s.id=a.safra_id left join pastos p on p.id=a.pasto_id where a.id=p_safra_area_id and a.cliente_id=p_cliente;
  if v_area.id is null then raise exception 'talhao/safra nao encontrado'; end if;
  if v_area.cultura <> 'mandioca' then raise exception 'esta RPC e so para mandioca (cultura %)', v_area.cultura; end if;
  if v_area.fazenda_id is null then raise exception 'talhao sem fazenda'; end if;
  if p_peso_bruto_kg is null or p_peso_bruto_kg <= 0 then raise exception 'peso bruto obrigatorio'; end if;
  if p_rendimento_g is null or p_rendimento_g <= 0 then raise exception 'rendimento obrigatorio'; end if;
  if p_preco_g is null or p_preco_g <= 0 then raise exception 'preco por grama obrigatorio'; end if;
  if p_industria_id is null then raise exception 'industria obrigatoria'; end if;
  v_liq := p_peso_bruto_kg - coalesce(p_desconto_kg,0);
  v_t := round(v_liq/1000.0, 2);
  v_valor := round(v_t * p_rendimento_g * p_preco_g, 2);
  v_tstr := to_char(v_t, 'FM999G990D00');
  select coalesce(nome_favorecido, nome) into v_ind from financeiro_fornecedores where id=p_industria_id;
  insert into agri_colheita (cliente_id, safra_area_id, data_colheita, peso_bruto_kg, peso_liquido_kg, desconto_kg, toneladas, rendimento_g, preco_g, industria_id, nf_produtor, ticket_balanca, destino, observacoes, ativo)
  values (p_cliente, p_safra_area_id, p_data, p_peso_bruto_kg, v_liq, coalesce(p_desconto_kg,0), v_t, p_rendimento_g, p_preco_g, p_industria_id, p_nf, p_ticket, 'venda', p_observacao, true) returning id into v_col;
  -- venda
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, safra_id, cultura, plano_conta_id, favorecido_id, tipo_operacao, sinal, valor, data_competencia, data_vencimento, status_transacao, cenario, origem_lancamento, compoe_dre, descricao, documento, created_by, updated_by)
  values (p_cliente, v_area.fazenda_id, v_area.safra_id, 'mandioca', c_venda, p_industria_id, '1-Entradas', 1, v_valor, p_data, p_data, 'programado', 'realizado', 'carga_mandioca', true, format('Venda %s t Mandioca · NF %s · %s g · %s', v_tstr, coalesce(p_nf,'-'), p_rendimento_g, coalesce(v_ind,'-')), p_nf, v_uid, v_uid) returning id into v_id;
  insert into agri_colheita_lancamentos values (v_col, v_id, 'venda'); v_ids := v_ids || v_id;
  -- icms: uma vez por NF
  select exists (select 1 from agri_colheita_lancamentos cl join agri_colheita c on c.id=cl.colheita_id join agri_safra_area a on a.id=c.safra_area_id where cl.papel='icms' and cl.ativo and c.ativo and c.cliente_id=p_cliente and a.safra_id=v_area.safra_id and c.nf_produtor=p_nf and c.id<>v_col) into v_icms_ja;
  if coalesce(p_icms,0) > 0 and not v_icms_ja then
    insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, safra_id, cultura, plano_conta_id, favorecido_id, tipo_operacao, sinal, valor, data_competencia, data_vencimento, status_transacao, cenario, origem_lancamento, compoe_dre, descricao, documento, created_by, updated_by)
    values (p_cliente, v_area.fazenda_id, v_area.safra_id, 'mandioca', c_imp, '948cab3f-52e3-46bd-b4b8-3e022828125b', '2-Saídas', -1, p_icms, p_data, p_data, 'programado', 'realizado', 'carga_mandioca', true, format('ICMS Venda Mandioca · NF %s', coalesce(p_nf,'-')), p_nf, v_uid, v_uid) returning id into v_id;
    insert into agri_colheita_lancamentos values (v_col, v_id, 'icms'); v_ids := v_ids || v_id;
  end if;
  if coalesce(p_funrural,0) > 0 then
    insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, safra_id, cultura, plano_conta_id, favorecido_id, tipo_operacao, sinal, valor, data_competencia, data_vencimento, status_transacao, cenario, origem_lancamento, compoe_dre, descricao, documento, created_by, updated_by)
    values (p_cliente, v_area.fazenda_id, v_area.safra_id, 'mandioca', c_imp, p_industria_id, '2-Saídas', -1, p_funrural, p_data, p_data, 'programado', 'realizado', 'carga_mandioca', true, format('Funrural Venda Mandioca · NF %s', coalesce(p_nf,'-')), p_nf, v_uid, v_uid) returning id into v_id;
    insert into agri_colheita_lancamentos values (v_col, v_id, 'funrural'); v_ids := v_ids || v_id;
  end if;
  -- servicos por tonelada
  for v_s in select * from jsonb_array_elements(coalesce(p_servicos,'[]'::jsonb)) loop
    v_papel := v_s->>'tipo';
    if v_papel not in ('arranquio','frete','carregamento') then raise exception 'servico invalido %', v_papel; end if;
    if coalesce((v_s->>'preco_t')::numeric,0) <= 0 then continue; end if;
    v_plano := case v_papel when 'frete' then c_frete else c_colh end;
    select coalesce(nome_favorecido, nome) into v_forn from financeiro_fornecedores where id=(v_s->>'fornecedor_id')::uuid;
    if v_forn is null then raise exception 'prestador do servico % nao encontrado', v_papel; end if;
    v_desc := format('%s Mandioca %s t · NF %s', initcap(v_papel), v_tstr, coalesce(p_nf,'-'));
    insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, safra_id, cultura, plano_conta_id, favorecido_id, tipo_operacao, sinal, valor, data_competencia, data_vencimento, status_transacao, cenario, origem_lancamento, compoe_dre, descricao, documento, created_by, updated_by)
    values (p_cliente, v_area.fazenda_id, v_area.safra_id, 'mandioca', v_plano, (v_s->>'fornecedor_id')::uuid, '2-Saídas', -1, round(v_t*(v_s->>'preco_t')::numeric,2), p_data, p_data, 'programado', 'realizado', 'carga_mandioca', true, v_desc, p_nf, v_uid, v_uid) returning id into v_id;
    insert into agri_colheita_lancamentos values (v_col, v_id, v_papel); v_ids := v_ids || v_id;
    v_serv_total := v_serv_total + round(v_t*(v_s->>'preco_t')::numeric,2);
  end loop;
  return jsonb_build_object('colheita_id', v_col, 'lancamento_ids', to_jsonb(v_ids), 'toneladas', v_t, 'valor_bruto', v_valor, 'servicos_total', v_serv_total, 'icms_lancado', coalesce(p_icms,0) > 0 and not v_icms_ja);
end $function$;

revoke all on function public.agri_carga_mandioca_registrar(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text) from public;
grant execute on function public.agri_carga_mandioca_registrar(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text) to authenticated;

CREATE OR REPLACE FUNCTION public.agri_carga_mandioca_corrigir(p_colheita_id uuid, p_safra_area_id uuid, p_data date, p_industria_id uuid, p_nf text, p_ticket text, p_peso_bruto_kg numeric, p_desconto_kg numeric, p_rendimento_g integer, p_preco_g numeric, p_servicos jsonb, p_icms numeric, p_funrural numeric, p_observacao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_cli uuid; v_r jsonb;
begin
  select cliente_id into v_cli from agri_colheita where id=p_colheita_id and ativo;
  if v_cli is null then raise exception 'carga nao encontrada'; end if;
  v_r := agri_carga_mandioca_cancelar(p_colheita_id, 'corrigida em '||now()::date);
  if not (v_r->>'ok')::boolean then return v_r; end if;
  return agri_carga_mandioca_registrar(v_cli, p_safra_area_id, p_data, p_industria_id, p_nf, p_ticket, p_peso_bruto_kg, p_desconto_kg, p_rendimento_g, p_preco_g, p_servicos, p_icms, p_funrural, p_observacao) || jsonb_build_object('substitui', p_colheita_id);
end $function$;

revoke all on function public.agri_carga_mandioca_corrigir(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text) from public;
grant execute on function public.agri_carga_mandioca_corrigir(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text) to authenticated;

CREATE OR REPLACE FUNCTION public.agri_carga_mandioca_cancelar(p_colheita_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_trav jsonb; v_uid uuid := coalesce(auth.uid(), '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e');
begin
  if coalesce(p_motivo,'') = '' then raise exception 'motivo obrigatorio'; end if;
  select jsonb_agg(jsonb_build_object('lancamento_id', l.id, 'descricao', l.descricao, 'status', l.status_transacao)) into v_trav
  from agri_colheita_lancamentos cl join financeiro_lancamentos_v2 l on l.id=cl.lancamento_id
  where cl.colheita_id=p_colheita_id and cl.ativo and coalesce(l.cancelado,false)=false
    and (l.status_transacao='realizado' or exists (select 1 from conciliacao_bancaria_itens i where i.lancamento_id=l.id and i.desfeito_em is null));
  if v_trav is not null then return jsonb_build_object('ok', false, 'motivo', 'lancamento_realizado_ou_conciliado', 'travados', v_trav); end if;
  update financeiro_lancamentos_v2 l set cancelado=true, updated_by=v_uid, observacao=coalesce(observacao||' · ','')||'cancelado com a carga: '||p_motivo
    from agri_colheita_lancamentos cl where cl.lancamento_id=l.id and cl.colheita_id=p_colheita_id and cl.ativo and coalesce(l.cancelado,false)=false;
  update agri_colheita_lancamentos set ativo=false where colheita_id=p_colheita_id;
  update agri_colheita set ativo=false, observacoes=coalesce(observacoes||' · ','')||'cancelada: '||p_motivo where id=p_colheita_id;
  return jsonb_build_object('ok', true);
end $function$;

revoke all on function public.agri_carga_mandioca_cancelar(uuid, text) from public;
grant execute on function public.agri_carga_mandioca_cancelar(uuid, text) to authenticated;
