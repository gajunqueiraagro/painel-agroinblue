-- FORN-CADASTRO-02 (Gabriel 18/10/2026, mock "Cadastro de Fornecedor") — o cadastro de fornecedor completo. ADITIVA: nada quebra.
--
-- · `nome` continua sendo o nome oficial = RAZAO SOCIAL (a tela muda so' o rotulo). Colunas novas, todas nulas:
--     identificacao: nome_fantasia, tipo_pessoa ('PJ'|'PF'), inscricao_estadual, inscricao_municipal;
--     endereco: cep, logradouro, numero, complemento, bairro, municipio, uf;
--     contato: celular, contato_nome;
--     padroes: plano_padrao_id (FK do plano, ON DELETE SET NULL).
-- · REUSADAS, NADA DUPLICADO (FASE 0, 18/10): email, telefone e observacao ja' existiam (vazias em 7.080 linhas); a forma
--   preferida e' `tipo_recebimento` (valores gravados 'PIX' 39 · 'Transferência Bancária' 2 · 'Boleto' 1); o titular da conta e'
--   `nome_favorecido` e o documento dele `cpf_cnpj_pagamento` (37 preenchidos); agencia e conta ja' existiam.
-- · `fn_fornecedor_uso(p_fornecedor)` — so' leitura, o "Uso" do cadastro (contagens do banco): lancamentos vivos, compras
--   parceladas (credor), documentos vivos (emitente no lancamento e na OC), ultimo lancamento e cadastrado em. Guarda pelo cliente
--   da linha (`_fn_exigir_tenant_das_linhas`, 42501).
-- · RLS: as quatro policies `tenant_ok` de sempre (nao tocadas).
set local lock_timeout = '2s';

alter table public.financeiro_fornecedores
  add column if not exists nome_fantasia text,
  add column if not exists tipo_pessoa text,
  add column if not exists inscricao_estadual text,
  add column if not exists inscricao_municipal text,
  add column if not exists cep text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists municipio text,
  add column if not exists uf text,
  add column if not exists celular text,
  add column if not exists contato_nome text,
  add column if not exists plano_padrao_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'financeiro_fornecedores_tipo_pessoa_chk') then
    alter table public.financeiro_fornecedores add constraint financeiro_fornecedores_tipo_pessoa_chk
      check (tipo_pessoa is null or tipo_pessoa in ('PJ', 'PF'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'financeiro_fornecedores_uf_chk') then
    alter table public.financeiro_fornecedores add constraint financeiro_fornecedores_uf_chk
      check (uf is null or uf ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'financeiro_fornecedores_plano_padrao_fkey') then
    alter table public.financeiro_fornecedores add constraint financeiro_fornecedores_plano_padrao_fkey
      foreign key (plano_padrao_id) references public.financeiro_plano_contas(id) on delete set null;
  end if;
end $$;

comment on column public.financeiro_fornecedores.nome is 'Razao social (o nome oficial). A fantasia mora em nome_fantasia.';
comment on column public.financeiro_fornecedores.tipo_recebimento is 'Forma de pagamento preferida (PIX · Transferência Bancária · Boleto …).';
comment on column public.financeiro_fornecedores.nome_favorecido is 'Titular da conta de pagamento.';
comment on column public.financeiro_fornecedores.cpf_cnpj_pagamento is 'CPF/CNPJ do titular da conta de pagamento.';

create or replace function public.fn_fornecedor_uso(p_fornecedor uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare f record;
begin
  perform public._fn_exigir_tenant_das_linhas(array[(select x.cliente_id from public.financeiro_fornecedores x where x.id = p_fornecedor)]);
  select id, cliente_id, created_at into f from public.financeiro_fornecedores where id = p_fornecedor;
  return jsonb_build_object(
    'cadastrado_em', f.created_at,
    'lancamentos', (select count(*) from public.financeiro_lancamentos_v2 l
                     where l.favorecido_id = f.id and l.cliente_id = f.cliente_id and l.cancelado is not true),
    'ultimo_lancamento', (select max(coalesce(l.data_pagamento, l.data_competencia)) from public.financeiro_lancamentos_v2 l
                     where l.favorecido_id = f.id and l.cliente_id = f.cliente_id and l.cancelado is not true),
    'compras_parceladas', (select count(*) from public.financiamentos c
                     where c.credor_id = f.id and c.natureza = 'parcelamento' and coalesce(c.status, '') <> 'cancelado'),
    'documentos', (select count(*) from public.financeiro_lancamento_documentos d where d.emitente_id = f.id and d.cancelado is not true)
                + (select count(*) from public.zoo_operacao_documentos d where d.emitente_id = f.id and d.cancelado is not true));
end $$;

revoke all on function public.fn_fornecedor_uso(uuid) from public, anon;
grant execute on function public.fn_fornecedor_uso(uuid) to authenticated, service_role;
