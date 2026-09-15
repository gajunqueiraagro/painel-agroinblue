-- PR-ESTOQUE-LOCAIS-EL01 — onde o grao fica: locais de estoque e contrato de armazenagem.
--
-- ⚠ JA APLICADA NO PROTO pelo arquiteto em 15/09/2026, com GO do Gabriel. E' REGISTRO HISTORICO.
--   Nao foi reaplicada.
-- ⚠ OS TRES CORPOS NAO FORAM REDIGITADOS: extraidos do banco em base64, decodificados e
--   conferidos um a um pelo md5 (8 primeiros digitos) —
--       595a324d  agri_local_estoque_salvar          (2.040 bytes)
--       5e259ffb  agri_contrato_armazenagem_salvar   (2.197 bytes)
--       907494c4  fn_locais_estoque                  (1.509 bytes)
--   ⚠ E O md5 PEGOU UM ERRO DE TRANSCRICAO: na primeira decodificacao o `fn_locais_estoque` deu
--   e5933fb4 e 1.508 bytes — um 'e' perdido em `'fornecdor_nome'` no lugar de `'fornecedor_nome'`.
--   Um byte. A chave teria ido errada para o payload e a tela mostraria fornecedor vazio, sem
--   nenhum erro. E' exatamente para isso que a conferencia existe; corrigido e reconferido.
--
-- ⚠ DOIS ASSUNTOS, DUAS TABELAS, E A SEPARACAO E' A REGRA: o LOCAL e' identidade e nao muda com o
--   tempo; o CONTRATO tem vigencia e muda. Guardar a quebra tecnica no local obrigaria a reescrever
--   o passado a cada renegociacao.
--
-- ⚠ O CHECK DE VINCULO E' EXCLUSIVO, e ele e' o coracao do cadastro:
--       proprio   => fazenda_id NOT NULL E fornecedor_id NULL
--       terceiro  => fornecedor_id NOT NULL
--   Um "local proprio numa cooperativa" nao existe, e o banco nao deixa inventar.
--
-- ⚠ O UNIQUE E' PARCIAL E MINUSCULO: `(cliente_id, lower(nome)) where ativo`. Duas decisoes ali —
--   `lower` porque "Galpao Sede" e "galpao sede" sao o mesmo galpao, e `where ativo` porque um
--   local desativado nao deve impedir que o nome volte a ser usado.
--
-- ⚠ `aliases` SAO A PONTE COM O ROMANEIO: o extrato da coop chama a filial de "0136" ou de
--   "0136 - Bataguassu", e e' por eles que o EL-02 vai casar o texto livre de `agri_colheita.filial`
--   com este cadastro. Sem alias, cada grafia nova seria um local novo.
--
-- ⚠ O CONTRATO VIGENTE E' UM SO', e a escolha e' da leitura, nao do banco: `fn_locais_estoque`
--   ordena por "ainda vigente" (fim nulo ou >= hoje) e depois por inicio desc, LIMIT 1. Nao ha'
--   constraint impedindo dois contratos sobrepostos — a tela mostra o que vale hoje.
--
-- ⚠ AS GRANTS SAO `ALL` para anon/authenticated/service_role, como em toda a familia `agri_*`
--   (default-privilege do Supabase). A RLS e' `*_open` nas quatro policies de cada tabela — o
--   isolamento por cliente vem do `cliente_id` que as RPCs escrevem e conferem. Divida herdada.
--
-- ⚠ E AS DUAS RPCs DE ESCRITA CONFEREM O TENANT DE VERDADE: `LOCAL_FAZENDA_DE_OUTRO_CLIENTE` e
--   `LOCAL_FORNECEDOR_DE_OUTRO_CLIENTE` existem porque com RLS aberta seria possivel vincular um
--   galpao a fazenda de outro cliente passando o uuid. A guarda esta' na funcao.

-- ── AS DUAS TABELAS ──────────────────────────────────────────────────────────────────────────
create table if not exists public.agri_locais_estoque (
  id uuid not null default gen_random_uuid(),
  cliente_id uuid not null,
  nome text not null,
  tipo text not null,
  fazenda_id uuid,
  fornecedor_id uuid,
  codigo_externo text,
  aliases text[],
  observacoes text,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  created_by uuid,
  updated_at timestamp with time zone not null default now(),
  updated_by uuid,
  constraint agri_locais_estoque_pkey primary key (id),
  constraint agri_locais_estoque_cliente_id_fkey foreign key (cliente_id) references public.clientes(id),
  constraint agri_locais_estoque_fazenda_id_fkey foreign key (fazenda_id) references public.fazendas(id),
  constraint agri_locais_estoque_fornecedor_id_fkey foreign key (fornecedor_id) references public.financeiro_fornecedores(id),
  constraint agri_locais_estoque_tipo_check check ((tipo = any (array['proprio'::text, 'terceiro'::text]))),
  constraint agri_locais_estoque_tipo_vinculo_check check (
    (((tipo = 'proprio'::text) and (fazenda_id is not null) and (fornecedor_id is null))
     or ((tipo = 'terceiro'::text) and (fornecedor_id is not null))))
);

comment on table public.agri_locais_estoque is
  'Local de estoque de graos (ESTOQUE-LOCAIS-01, EL-01). proprio = galpao/silo numa fazenda do cliente; terceiro = cooperativa ou armazem geral (fornecedor). codigo_externo = filial/unidade do armazem; aliases casam a filial vinda de romaneio/extrato.';

create index if not exists agri_locais_estoque_cliente_idx
  on public.agri_locais_estoque using btree (cliente_id) where ativo;
create unique index if not exists agri_locais_estoque_nome_uk
  on public.agri_locais_estoque using btree (cliente_id, lower(nome)) where ativo;

create table if not exists public.agri_contratos_armazenagem (
  id uuid not null default gen_random_uuid(),
  cliente_id uuid not null,
  local_id uuid not null,
  vigencia_inicio date not null,
  vigencia_fim date,
  quebra_tecnica_tipo text not null default 'nenhuma'::text,
  quebra_tecnica_pct numeric,
  quebra_tecnica_base text,
  taxa_armazenagem_valor numeric,
  taxa_armazenagem_unidade text,
  documento_ref text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  created_by uuid,
  updated_at timestamp with time zone not null default now(),
  updated_by uuid,
  constraint agri_contratos_armazenagem_pkey primary key (id),
  constraint agri_contratos_armazenagem_cliente_id_fkey foreign key (cliente_id) references public.clientes(id),
  constraint agri_contratos_armazenagem_local_id_fkey foreign key (local_id) references public.agri_locais_estoque(id),
  constraint agri_contratos_armazenagem_quebra_tecnica_tipo_check check ((quebra_tecnica_tipo = any (array['percentual_mes'::text, 'tabela'::text, 'nenhuma'::text]))),
  constraint agri_contratos_armazenagem_quebra_tecnica_base_check check (((quebra_tecnica_base is null) or (quebra_tecnica_base = any (array['saldo_fechamento'::text, 'saldo_medio'::text])))),
  constraint agri_contratos_armazenagem_quebra_tecnica_pct_check check (((quebra_tecnica_pct is null) or (quebra_tecnica_pct >= (0)::numeric))),
  constraint agri_contratos_armazenagem_pct_check check (((quebra_tecnica_tipo <> 'percentual_mes'::text) or ((quebra_tecnica_pct is not null) and (quebra_tecnica_base is not null)))),
  constraint agri_contratos_armazenagem_taxa_armazenagem_unidade_check check (((taxa_armazenagem_unidade is null) or (taxa_armazenagem_unidade = any (array['rs_por_saca_mes'::text, 'pct_mes'::text])))),
  constraint agri_contratos_armazenagem_taxa_armazenagem_valor_check check (((taxa_armazenagem_valor is null) or (taxa_armazenagem_valor >= (0)::numeric))),
  constraint agri_contratos_armazenagem_vigencia_check check (((vigencia_fim is null) or (vigencia_fim >= vigencia_inicio)))
);

comment on table public.agri_contratos_armazenagem is
  'Contrato de armazenagem de um local TERCEIRO (EL-01). A regra real de quebra tecnica se congela depois de ver um extrato de deposito da coop; ate la nenhuma e valido.';

create index if not exists agri_contratos_armazenagem_local_idx
  on public.agri_contratos_armazenagem using btree (local_id) where ativo;

alter table public.agri_locais_estoque enable row level security;
create policy agri_locais_estoque_select_open on public.agri_locais_estoque for select using (true);
create policy agri_locais_estoque_insert_open on public.agri_locais_estoque for insert with check (true);
create policy agri_locais_estoque_update_open on public.agri_locais_estoque for update using (true);
create policy agri_locais_estoque_delete_open on public.agri_locais_estoque for delete using (true);
grant all on table public.agri_locais_estoque to anon, authenticated, service_role;

alter table public.agri_contratos_armazenagem enable row level security;
create policy agri_contratos_armazenagem_select_open on public.agri_contratos_armazenagem for select using (true);
create policy agri_contratos_armazenagem_insert_open on public.agri_contratos_armazenagem for insert with check (true);
create policy agri_contratos_armazenagem_update_open on public.agri_contratos_armazenagem for update using (true);
create policy agri_contratos_armazenagem_delete_open on public.agri_contratos_armazenagem for delete using (true);
grant all on table public.agri_contratos_armazenagem to anon, authenticated, service_role;

-- ── AS DUAS ESCRITAS E A LEITURA ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agri_local_estoque_salvar(p_cliente uuid, p_id uuid, p_nome text, p_tipo text, p_fazenda_id uuid, p_fornecedor_id uuid, p_codigo_externo text, p_aliases text[], p_observacoes text, p_ativo boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_id uuid;
begin
  if p_nome is null or btrim(p_nome) = '' then raise exception 'LOCAL_NOME_OBRIGATORIO'; end if;
  if p_tipo = 'proprio' and p_fazenda_id is not null and not exists (select 1 from fazendas f where f.id = p_fazenda_id and f.cliente_id = p_cliente) then
    raise exception 'LOCAL_FAZENDA_DE_OUTRO_CLIENTE'; end if;
  if p_tipo = 'terceiro' and p_fornecedor_id is not null and not exists (select 1 from financeiro_fornecedores x where x.id = p_fornecedor_id and x.cliente_id = p_cliente) then
    raise exception 'LOCAL_FORNECEDOR_DE_OUTRO_CLIENTE'; end if;
  if p_id is null then
    insert into agri_locais_estoque (cliente_id, nome, tipo, fazenda_id, fornecedor_id, codigo_externo, aliases, observacoes, ativo, created_by, updated_by)
    values (p_cliente, btrim(p_nome), p_tipo, case when p_tipo='proprio' then p_fazenda_id end, case when p_tipo='terceiro' then p_fornecedor_id end,
            nullif(btrim(p_codigo_externo),''), p_aliases, p_observacoes, coalesce(p_ativo,true), auth.uid(), auth.uid())
    returning id into v_id;
  else
    update agri_locais_estoque
       set nome = btrim(p_nome), tipo = p_tipo,
           fazenda_id = case when p_tipo='proprio' then p_fazenda_id end,
           fornecedor_id = case when p_tipo='terceiro' then p_fornecedor_id end,
           codigo_externo = nullif(btrim(p_codigo_externo),''), aliases = p_aliases, observacoes = p_observacoes,
           ativo = coalesce(p_ativo,true), updated_at = now(), updated_by = auth.uid()
     where id = p_id and cliente_id = p_cliente returning id into v_id;
    if v_id is null then raise exception 'LOCAL_NAO_ENCONTRADO'; end if;
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.agri_contrato_armazenagem_salvar(p_cliente uuid, p_id uuid, p_local_id uuid, p_vigencia_inicio date, p_vigencia_fim date, p_quebra_tecnica_tipo text, p_quebra_tecnica_pct numeric, p_quebra_tecnica_base text, p_taxa_valor numeric, p_taxa_unidade text, p_documento_ref text, p_observacoes text, p_ativo boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_id uuid; v_tipo text;
begin
  select tipo into v_tipo from agri_locais_estoque where id = p_local_id and cliente_id = p_cliente;
  if v_tipo is null then raise exception 'LOCAL_NAO_ENCONTRADO'; end if;
  if v_tipo <> 'terceiro' then raise exception 'CONTRATO_SO_PARA_LOCAL_TERCEIRO'; end if;
  if p_vigencia_inicio is null then raise exception 'VIGENCIA_INICIO_OBRIGATORIA'; end if;
  if p_id is null then
    insert into agri_contratos_armazenagem (cliente_id, local_id, vigencia_inicio, vigencia_fim, quebra_tecnica_tipo, quebra_tecnica_pct, quebra_tecnica_base,
      taxa_armazenagem_valor, taxa_armazenagem_unidade, documento_ref, observacoes, ativo, created_by, updated_by)
    values (p_cliente, p_local_id, p_vigencia_inicio, p_vigencia_fim, coalesce(p_quebra_tecnica_tipo,'nenhuma'), p_quebra_tecnica_pct, p_quebra_tecnica_base,
      p_taxa_valor, p_taxa_unidade, p_documento_ref, p_observacoes, coalesce(p_ativo,true), auth.uid(), auth.uid())
    returning id into v_id;
  else
    update agri_contratos_armazenagem
       set local_id = p_local_id, vigencia_inicio = p_vigencia_inicio, vigencia_fim = p_vigencia_fim,
           quebra_tecnica_tipo = coalesce(p_quebra_tecnica_tipo,'nenhuma'), quebra_tecnica_pct = p_quebra_tecnica_pct, quebra_tecnica_base = p_quebra_tecnica_base,
           taxa_armazenagem_valor = p_taxa_valor, taxa_armazenagem_unidade = p_taxa_unidade, documento_ref = p_documento_ref, observacoes = p_observacoes,
           ativo = coalesce(p_ativo,true), updated_at = now(), updated_by = auth.uid()
     where id = p_id and cliente_id = p_cliente returning id into v_id;
    if v_id is null then raise exception 'CONTRATO_NAO_ENCONTRADO'; end if;
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_locais_estoque(p_cliente uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'nome', l.nome, 'tipo', l.tipo, 'ativo', l.ativo,
      'fazenda_id', l.fazenda_id, 'fazenda_nome', f.nome,
      'fornecedor_id', l.fornecedor_id, 'fornecedor_nome', x.nome,
      'codigo_externo', l.codigo_externo, 'aliases', to_jsonb(coalesce(l.aliases, '{}'::text[])),
      'observacoes', l.observacoes,
      'contrato', (select jsonb_build_object('id', c.id, 'vigencia_inicio', c.vigencia_inicio, 'vigencia_fim', c.vigencia_fim,
                     'quebra_tecnica_tipo', c.quebra_tecnica_tipo, 'quebra_tecnica_pct', c.quebra_tecnica_pct, 'quebra_tecnica_base', c.quebra_tecnica_base,
                     'taxa_armazenagem_valor', c.taxa_armazenagem_valor, 'taxa_armazenagem_unidade', c.taxa_armazenagem_unidade,
                     'documento_ref', c.documento_ref, 'observacoes', c.observacoes)
                   from agri_contratos_armazenagem c where c.local_id = l.id and c.ativo
                   order by (c.vigencia_fim is null or c.vigencia_fim >= current_date) desc, c.vigencia_inicio desc limit 1)
    ) order by l.ativo desc, l.tipo, l.nome), '[]'::jsonb)
  from agri_locais_estoque l
  left join fazendas f on f.id = l.fazenda_id
  left join financeiro_fornecedores x on x.id = l.fornecedor_id
  where l.cliente_id = p_cliente;
$function$;

revoke all on function public.agri_local_estoque_salvar(uuid, uuid, text, text, uuid, uuid, text, text[], text, boolean) from public;
grant execute on function public.agri_local_estoque_salvar(uuid, uuid, text, text, uuid, uuid, text, text[], text, boolean) to authenticated;
revoke all on function public.agri_contrato_armazenagem_salvar(uuid, uuid, uuid, date, date, text, numeric, text, numeric, text, text, text, boolean) from public;
grant execute on function public.agri_contrato_armazenagem_salvar(uuid, uuid, uuid, date, date, text, numeric, text, numeric, text, text, text, boolean) to authenticated;
revoke all on function public.fn_locais_estoque(uuid) from public;
grant execute on function public.fn_locais_estoque(uuid) to authenticated;

-- ── O BACKFILL DO NJ ─────────────────────────────────────────────────────────────────────────
-- ⚠ IDS FIXOS, e nao `gen_random_uuid()`: um ambiente limpo tem de chegar aos MESMOS ids do
--   Proto, senao qualquer referencia futura a este local (EL-02 em diante) apontaria para nada.
-- ⚠ `on conflict do nothing` PORQUE ELA JA' RODOU NO PROTO. Aqui ela e' registro; num banco novo
--   ela cria. Rodar duas vezes nao pode duplicar.
-- ⚠ O QUE ESTE BACKFILL AFIRMA: toda a colheita do NJ ate' 15/09/2026 entrou nesta filial da
--   cooperativa — e' o que o campo `filial` de `agri_colheita` dizia em texto livre. O EL-02 troca
--   aquele texto por este id.
insert into public.agri_locais_estoque
  (id, cliente_id, nome, tipo, fazenda_id, fornecedor_id, codigo_externo, aliases, observacoes, ativo)
values (
  'c2357d59-d9f6-4e7f-9f2a-c59e46ec70cc',
  'f2d67cd4-24d0-456f-a079-a3281dcce7fd',
  'Coop Parapua - 0136', 'terceiro', null,
  'f01a7cf4-b057-4a5a-bab9-acba416b19a6',
  '0136', array['0136','0136 - Bataguassu']::text[],
  'Criado no backfill EL-01 (15/09/2026): toda colheita do NJ ate aqui entrou nesta filial (campo filial de agri_colheita).',
  true
) on conflict (id) do nothing;

insert into public.agri_contratos_armazenagem
  (id, cliente_id, local_id, vigencia_inicio, vigencia_fim, quebra_tecnica_tipo,
   quebra_tecnica_pct, quebra_tecnica_base, taxa_armazenagem_valor, taxa_armazenagem_unidade,
   documento_ref, observacoes, ativo)
values (
  'dfaa8e72-356e-406f-9e0f-038fb99aef16',
  'f2d67cd4-24d0-456f-a079-a3281dcce7fd',
  'c2357d59-d9f6-4e7f-9f2a-c59e46ec70cc',
  '2023-07-01', null, 'nenhuma', null, null, null, null, null,
  'Regra de quebra tecnica a definir com o extrato de deposito real da coop (spec 8.a).',
  true
) on conflict (id) do nothing;
