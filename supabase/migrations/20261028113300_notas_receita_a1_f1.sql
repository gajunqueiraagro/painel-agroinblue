-- NOTAS-RECEITA-A1-01 · F1 (FASE 0 12/11 22:45; parecer do Chat 23:40 — a APROVAÇÃO do desenho é do Gabriel): as tabelas da busca de notas
-- na Receita/SEFAZ com o certificado A1 do cliente. SÓ METADADOS E ESTADO — o certificado (.pfx) e a senha NUNCA entram no banco:
--   · o .pfx vai cifrado (AES-GCM, chave-mestra só na função de borda) num bucket privado (F2); a senha, no Vault (F2);
--   · aqui: quem é o titular, a validade, o emissor, a impressão digital, a situação; e as REFERÊNCIAS ao cofre numa tabela que só o
--     `service_role` (a função de borda) enxerga (`fiscal_certificados_cofre`);
--   · a trilha (subiu/trocou/revogou/venceu/recusa da SEFAZ) é IMUTÁVEL: nada a altera nem apaga;
--   · a caixa de entrada dos documentos baixados (`fiscal_dfe_recebidos`), com a chave única (cliente, chave de acesso) — a mesma guarda
--     de duplicidade da casa — e o relógio da SEFAZ por titular (`fiscal_dfe_controle`: último NSU, "não antes de", um pedido por vez).
-- authenticated: SÓ LÊ, pela RLS do cliente (tenant_ok). Escreve: a função de borda (service_role) e a RPC de revogar (só o admin do cliente
-- — `gestor_cliente` — ou o admin AgroinBlue; D2 do Gabriel), com trilha. Nenhum dado de cliente muda. Bucket, segredo do Vault e função de
-- borda NÃO são criados aqui (F2, só depois do OK do Gabriel).
set local lock_timeout = '2s';

-- ── quem pode mexer no certificado de um cliente: o admin AgroinBlue ou o gestor DAQUELE cliente ─────────────────────────────────
create or replace function public._fn_fiscal_certificado_pode(p_cliente uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(public.is_admin_agroinblue(auth.uid()), false)
      or coalesce(public.get_user_perfil(auth.uid(), p_cliente)::text = 'gestor_cliente', false)
$$;
revoke all on function public._fn_fiscal_certificado_pode(uuid) from public, anon, authenticated;
grant execute on function public._fn_fiscal_certificado_pode(uuid) to service_role;

-- ── o certificado (metadados; um ATIVO por titular) ──────────────────────────────────────────────────────────────────────────────
create table public.fiscal_certificados (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  titular_id uuid not null references public.fiscal_titulares(id),
  documento text not null,                 -- o CPF/CNPJ que o certificado traz (só dígitos) = o do titular (conferido na borda)
  emissor text,                            -- a AC emissora (ICP-Brasil)
  numero_serie text,
  impressao_digital text not null,         -- SHA-256 (hex) do certificado PÚBLICO: identifica sem expor nada
  valido_de timestamptz not null,
  valido_ate timestamptz not null,
  situacao text not null default 'ativo',
  enviado_por uuid,
  enviado_em timestamptz not null default now(),
  substituido_por uuid references public.fiscal_certificados(id),
  revogado_por uuid,
  revogado_em timestamptz,
  revogado_motivo text,
  constraint fiscal_certificados_situacao_ck check (situacao in ('ativo', 'substituido', 'revogado', 'vencido', 'recusado_sefaz')),
  constraint fiscal_certificados_documento_ck check (documento ~ '^([0-9]{11}|[0-9]{14})$'),
  constraint fiscal_certificados_digital_ck check (impressao_digital ~ '^[0-9a-f]{64}$'),
  constraint fiscal_certificados_validade_ck check (valido_ate > valido_de),
  constraint fiscal_certificados_revogado_ck check ((situacao = 'revogado') = (revogado_em is not null))
);
create unique index fiscal_certificados_um_ativo_uq on public.fiscal_certificados (titular_id) where situacao = 'ativo';
create index fiscal_certificados_cliente_ix on public.fiscal_certificados (cliente_id);
comment on table public.fiscal_certificados is
  'NOTAS-RECEITA-A1-01 — o certificado A1 de um titular: SÓ metadados (validade, emissor, impressão digital, situação). O .pfx e a senha nunca entram no banco.';

-- ── as referências ao cofre: SÓ a função de borda (service_role) vê ─────────────────────────────────────────────────────────────
create table public.fiscal_certificados_cofre (
  certificado_id uuid primary key references public.fiscal_certificados(id),
  objeto text,                             -- o caminho do .pfx CIFRADO no bucket privado (null depois de revogado)
  segredo_id uuid                          -- o id do segredo da senha no Vault (null depois de revogado)
);
comment on table public.fiscal_certificados_cofre is
  'NOTAS-RECEITA-A1-01 — onde está o .pfx cifrado e o id do segredo da senha no Vault. Sem acesso para authenticated/anon.';

-- ── a trilha (IMUTÁVEL) ──────────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.fiscal_certificados_trilha (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.clientes(id),
  titular_id uuid not null references public.fiscal_titulares(id),
  certificado_id uuid references public.fiscal_certificados(id),
  acao text not null,
  autor uuid,
  via text,
  em timestamptz not null default now(),
  motivo text,
  detalhe jsonb,
  constraint fiscal_certificados_trilha_acao_ck check (acao in ('subiu', 'trocou', 'revogou', 'venceu', 'recusado_sefaz', 'recusado_upload'))
);
create index fiscal_certificados_trilha_titular_ix on public.fiscal_certificados_trilha (titular_id, em desc);

create or replace function public._fn_fiscal_trilha_imutavel()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'A trilha do certificado não se altera nem se apaga.';
end $$;
create trigger trg_fiscal_trilha_imutavel before update or delete on public.fiscal_certificados_trilha
  for each row execute function public._fn_fiscal_trilha_imutavel();

-- ── a caixa de entrada dos documentos baixados da SEFAZ ─────────────────────────────────────────────────────────────────────────
create table public.fiscal_dfe_recebidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  titular_id uuid not null references public.fiscal_titulares(id),
  tipo text not null default 'nfe',
  chave text not null,
  nsu bigint,
  esquema text,                            -- resNFe · procNFe · resEvento · procEventoNFe (a tag `schema` da resposta)
  situacao text not null default 'resumo',
  emitente_documento text,
  emitente_nome text,
  emissao date,
  valor_cent bigint,
  resumo jsonb,
  xml text,                                -- o XML completo (procNFe), quando a SEFAZ o entrega
  nota_id uuid references public.nota_fiscal(id),
  recebido_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fiscal_dfe_tipo_ck check (tipo in ('nfe', 'cte', 'nfse')),
  constraint fiscal_dfe_situacao_ck check (situacao in ('resumo', 'manifestado', 'xml', 'importado', 'ignorado', 'cancelado_na_sefaz')),
  constraint fiscal_dfe_chave_ck check (chave ~ '^[0-9]{44}$' or (tipo = 'nfse' and chave ~ '^[0-9]{50}$')),
  constraint fiscal_dfe_recebidos_chave_uq unique (cliente_id, chave)
);
create index fiscal_dfe_recebidos_situacao_ix on public.fiscal_dfe_recebidos (cliente_id, situacao);

-- ── o relógio da SEFAZ, por titular (o limite é do CPF/CNPJ) ─────────────────────────────────────────────────────────────────────
create table public.fiscal_dfe_controle (
  titular_id uuid primary key references public.fiscal_titulares(id),
  cliente_id uuid not null references public.clientes(id),
  ult_nsu bigint not null default 0,
  max_nsu bigint,
  nao_antes_de timestamptz,                -- 1 h depois de um "nada novo" (137) ou do bloqueio por consumo indevido (656)
  ultimo_cstat text,
  ultima_busca_em timestamptz,
  em_andamento_desde timestamptz           -- um pedido por titular por vez
);

-- ── RLS: authenticated SÓ LÊ, do próprio cliente; o cofre ninguém além do service_role ─────────────────────────────────────────
alter table public.fiscal_certificados enable row level security;
alter table public.fiscal_certificados_cofre enable row level security;
alter table public.fiscal_certificados_trilha enable row level security;
alter table public.fiscal_dfe_recebidos enable row level security;
alter table public.fiscal_dfe_controle enable row level security;
create policy fiscal_certificados_ler on public.fiscal_certificados for select to authenticated using (public.tenant_ok(cliente_id));
create policy fiscal_certificados_trilha_ler on public.fiscal_certificados_trilha for select to authenticated using (public.tenant_ok(cliente_id));
create policy fiscal_dfe_recebidos_ler on public.fiscal_dfe_recebidos for select to authenticated using (public.tenant_ok(cliente_id));
create policy fiscal_dfe_controle_ler on public.fiscal_dfe_controle for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.fiscal_certificados, public.fiscal_certificados_cofre, public.fiscal_certificados_trilha,
  public.fiscal_dfe_recebidos, public.fiscal_dfe_controle from public, anon, authenticated;
grant select on public.fiscal_certificados, public.fiscal_certificados_trilha, public.fiscal_dfe_recebidos, public.fiscal_dfe_controle to authenticated;
grant all on public.fiscal_certificados, public.fiscal_certificados_cofre, public.fiscal_certificados_trilha,
  public.fiscal_dfe_recebidos, public.fiscal_dfe_controle to service_role;
grant usage on sequence public.fiscal_certificados_trilha_id_seq to service_role;

-- ── revogar (o gesto do admin; o .pfx e o segredo são apagados do cofre pela função de borda, que lê a situação) ─────────────────
create or replace function public.fn_fiscal_certificado_revogar(p_certificado_id uuid, p_motivo text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare c public.fiscal_certificados; v_titular text;
begin
  select * into c from public.fiscal_certificados where id = p_certificado_id;
  if c.id is null or not coalesce(public.tenant_ok(c.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este certificado.';
  end if;
  if not public._fn_fiscal_certificado_pode(c.cliente_id) then
    raise exception using errcode = '42501', message = 'Só o administrador do cliente revoga o certificado.';
  end if;
  if c.situacao <> 'ativo' then raise exception '%', format('Este certificado já está %s.', c.situacao); end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Diga o motivo da revogação.'; end if;
  select nome into v_titular from public.fiscal_titulares where id = c.titular_id;
  if p_simular then
    return jsonb_build_object('simulado', true, 'gravado', false, 'certificado_id', c.id,
      'frase', format('Revoga o certificado de %s (válido até %s). A busca na Receita para até um certificado novo; o já baixado fica.',
                      v_titular, to_char(c.valido_ate at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')));
  end if;
  update public.fiscal_certificados set situacao = 'revogado', revogado_por = auth.uid(), revogado_em = now(), revogado_motivo = btrim(p_motivo)
   where id = c.id;
  insert into public.fiscal_certificados_trilha (cliente_id, titular_id, certificado_id, acao, autor, via, motivo)
  values (c.cliente_id, c.titular_id, c.id, 'revogou', auth.uid(), public._fn_trilha_via(), btrim(p_motivo));
  return jsonb_build_object('simulado', false, 'gravado', true, 'certificado_id', c.id);
end $$;
revoke all on function public.fn_fiscal_certificado_revogar(uuid, text, boolean) from public, anon;
grant execute on function public.fn_fiscal_certificado_revogar(uuid, text, boolean) to authenticated, service_role;
