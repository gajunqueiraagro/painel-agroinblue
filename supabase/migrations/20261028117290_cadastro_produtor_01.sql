-- CADASTRO-PRODUTOR-01 · o banco da tela Cadastros › Produtores (mock aprovado 05/11 11:43 + adendo 11:51; decisões D-P1…D-P7 do Gabriel
-- 05/11). É o F1/F1b da FISCAL-01 crescendo: as mesmas fiscal_titulares e fiscal_fazenda_titulares (117270), sem tabela paralela.
-- (1) D-P1 · CNPJ alfanumérico (Receita, jul/2026: 12 posições 0-9/A-Z + 2 dígitos; o valor de cada posição é o ASCII − 48, o mesmo
--     módulo 11). O CPF não muda; os CNPJs numéricos de hoje continuam válidos.
-- (2) fiscal_titulares: papel produtor | terceiro (D-P3: o parceiro de rateio, ex. o Higino, é um titular com CPF validado que não é
--     produtor do cliente e não entra no seletor), CNPJ do produtor PF, nascimento, e-mail e endereço fiscais, regime do IR. "Cadastro
--     incompleto" é derivado (_fn_fiscal_titular_pendencias) e NUNCA bloqueia; nome e documento continuam obrigatórios (são a identidade).
-- (3) fiscal_titular_ies: as IEs do titular, várias, por UF (e a fazenda, se a IE é de uma). A coluna fiscal_titulares.ie (0 linhas) fica
--     aposentada por um CHECK (ie is null): um dono só da IE do produtor; ela sai numa limpeza (sem DROP aqui).
-- (4) fiscal_fazenda_titulares: condição no imóvel e "o que o financeiro registra" (total da fazenda: o livro divide pela participação;
--     só a parte: o livro leva 100%). D-P5: soma ≠ 100 deixa de recusar e vira aviso.
-- (5) D-P2 · fazenda_cadastros.ccir, ao lado do nirf e do car.
-- (6) fiscal_titular_condicao_ibs (histórico com vigência) e (7) fiscal_titular_grupo (as PJs do produtor, com %, vigência).
-- (8) D-P4 · o titular da conta bancária: SÓ a ligação ao produtor grava titular_nome/titular_documento (fn_fiscal_conta_titular_gravar);
--     o gatilho trg_fiscal_conta_titular_um_dono recusa qualquer outro escritor que MUDE os dois campos (mandar o mesmo valor passa).
-- (9) Acordos de rateio (D-P6/D-P7): fiscal_acordos_rateio + fiscal_lancamento_acordo (a ligação do lançamento, o % congelado; nulo =
--     "a confirmar", e o livro não o soma até o % ser preenchido) + a sugestão (leitura, nunca grava).
-- Fica para depois: o livro por produtor e a exceção de produtor (P6, depende da resposta do Code 2) e o reconhecimento pela nota (P7,
-- depende do GO da 117280). Nada muda nos lançamentos: nem valor, nem conta, nem conciliação.
-- Acesso: tabelas só leitura para authenticated pela RLS do cliente (tenant_ok) + o gatilho do perfil leitura; escrita só pelas funções
-- (SECURITY DEFINER, tenant_ok → 42501, prévia por p_simular, trilha na audit_log com o autor logado e a via); auxiliares fechadas.
set local lock_timeout = '2s';

-- ── (1) o documento ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._fn_documento_normalizar(p text)
returns text language sql immutable set search_path = pg_catalog as $$
  select upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'))
$$;

create or replace function public._fn_cpf_cnpj_valido(p text)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare d int[]; n int; s int; r int; i int; w int[];
begin
  if p is null or p !~ '^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$' then return false; end if;
  n := length(p);
  if p = repeat(substr(p, 1, 1), n) then return false; end if;
  d := array(select ascii(substr(p, g, 1)) - 48 from generate_series(1, n) g);
  if n = 11 then
    s := 0; for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    if r <> d[10] then return false; end if;
    s := 0; for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    return r = d[11];
  end if;
  w := array[5,4,3,2,9,8,7,6,5,4,3,2];
  s := 0; for i in 1..12 loop s := s + d[i] * w[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  if r <> d[13] then return false; end if;
  w := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s := 0; for i in 1..13 loop s := s + d[i] * w[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  return r = d[14];
end $$;

-- um texto opcional do payload: a chave ausente mantém o atual; presente e vazia = nulo
create or replace function public._fn_fiscal_campo_texto(p_dados jsonb, p_chave text, p_atual text)
returns text language sql immutable set search_path = pg_catalog as $$
  select case when p_dados ? p_chave
              then nullif(btrim(regexp_replace(coalesce(p_dados->>p_chave, ''), '\s+', ' ', 'g')), '')
              else p_atual end
$$;

-- ── (2) o titular ganha o resto da ficha ───────────────────────────────────────────────────────────────────────────────────────
alter table public.fiscal_titulares
  add column papel text not null default 'produtor' constraint fiscal_titulares_papel_ck check (papel in ('produtor', 'terceiro')),
  add column cnpj_produtor text constraint fiscal_titulares_cnpj_produtor_ck
    check (cnpj_produtor is null or (length(cnpj_produtor) = 14 and length(documento) = 11 and public._fn_cpf_cnpj_valido(cnpj_produtor))),
  add column nascimento date constraint fiscal_titulares_nascimento_ck
    check (nascimento is null or (nascimento >= date '1900-01-01' and length(documento) = 11)),
  add column email_fiscal text constraint fiscal_titulares_email_ck
    check (email_fiscal is null or email_fiscal ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  add column endereco text constraint fiscal_titulares_endereco_ck check (endereco is null or btrim(endereco) <> ''),
  add column municipio text constraint fiscal_titulares_municipio_ck check (municipio is null or btrim(municipio) <> ''),
  add column uf text constraint fiscal_titulares_uf_ck check (uf is null or uf ~ '^[A-Z]{2}$'),
  add column cep text constraint fiscal_titulares_cep_ck check (cep is null or cep ~ '^[0-9]{8}$'),
  add column regime_ir text constraint fiscal_titulares_regime_ck
    check (regime_ir is null or (regime_ir = 'pf_atividade_rural' and length(documento) = 11)
           or (regime_ir in ('pj_presumido', 'pj_real', 'pj_simples') and length(documento) = 14)),
  add constraint fiscal_titulares_ie_aposentada_ck check (ie is null);
comment on column public.fiscal_titulares.ie is
  'APOSENTADA (CADASTRO-PRODUTOR-01): a IE do titular mora em fiscal_titular_ies. Fica vazia para sempre (CHECK) e sai numa migration de '
  'limpeza.';
comment on column public.fiscal_titulares.documento is
  'CPF (11 dígitos) ou CNPJ (14: numérico ou alfanumérico, 12 posições 0-9/A-Z + 2 dígitos), sem pontuação, em maiúsculas, com o dígito '
  'verificador conferido (_fn_cpf_cnpj_valido).';
comment on column public.fiscal_titulares.papel is
  'produtor = contribuinte do cliente (entra no seletor do livro e da Reforma); terceiro = parceiro de rateio (ex. quem tem a nota no '
  'nome e divide a despesa), cadastrado para os acordos e para a leitura da nota; não é cliente nem produtor.';
comment on column public.fiscal_titulares.regime_ir is
  'pf_atividade_rural (a PF escolhe resultado real × presumido de 20% na declaração; o Resumo fiscal compara) | pj_presumido | pj_real | '
  'pj_simples.';

-- ── (3) as IEs ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.fiscal_titular_ies (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  titular_id uuid not null references public.fiscal_titulares(id),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  ie text not null check (ie ~ '^P?[0-9]{8,14}$'),
  fazenda_id uuid references public.fazendas(id),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.fiscal_titular_ies is
  'CADASTRO-PRODUTOR-01: as inscrições estaduais do titular (várias, por UF; a fazenda quando a IE é de um imóvel). Tirar da lista '
  'inativa (nada se apaga). Escrita só por fn_fiscal_titular_gravar (chave "ies").';
create unique index fiscal_titular_ies_uq on public.fiscal_titular_ies (titular_id, uf, ie);
create index fiscal_titular_ies_ie_idx on public.fiscal_titular_ies (cliente_id, ie) where ativo;

-- ── (4) a participação ganha a condição e "o que o financeiro registra" ───────────────────────────────────────────────────────
alter table public.fiscal_fazenda_titulares
  add column condicao text not null default 'proprietario' constraint fiscal_fazenda_titulares_condicao_ck
    check (condicao in ('proprietario', 'condomino', 'arrendatario', 'parceiro', 'comodatario')),
  add column registra text not null default 'total' constraint fiscal_fazenda_titulares_registra_ck
    check (registra in ('total', 'so_a_parte'));
comment on column public.fiscal_fazenda_titulares.registra is
  'O que o financeiro desta fazenda registra para este produtor: total (o livro leva a participação %) | so_a_parte (o financeiro já '
  'é só a parte dele: o livro leva 100% e a participação fica como dado do imóvel). Nunca dividir duas vezes.';
comment on table public.fiscal_fazenda_titulares is
  'FISCAL-01 F1 / CADASTRO-PRODUTOR-01: a composição da fazenda (quem é titular, com quantos %, em que condição, e o que o financeiro '
  'registra), por vigência. Uma versão = as linhas com o mesmo vigencia_inicio e substituida_em nulo. A soma ≠ 100 é aviso, não '
  'recusa (D-P5). Corrigir a versão marca substituida_em (nada se apaga). Escrita só por fn_fiscal_fazenda_titulares_gravar.';

-- ── (5) CCIR ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.fazenda_cadastros
  add column ccir text constraint fazenda_cadastros_ccir_ck check (ccir is null or btrim(ccir) <> '');
comment on column public.fazenda_cadastros.ccir is 'CADASTRO-PRODUTOR-01 (D-P2): o CCIR do imóvel, ao lado do NIRF e do CAR (uma matrícula por fazenda).';

-- ── (6) a condição no IBS/CBS, com histórico ────────────────────────────────────────────────────────────────────────────────────
create table public.fiscal_titular_condicao_ibs (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  titular_id uuid not null references public.fiscal_titulares(id),
  condicao text not null check (condicao in ('nao_contribuinte', 'contribuinte_pelo_limite', 'optante', 'integrado')),
  vigencia_inicio date not null,
  vigencia_fim date check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  motivo text not null check (length(btrim(motivo)) >= 3),
  substituida_em timestamptz,
  criado_por uuid,
  created_at timestamptz not null default now()
);
comment on table public.fiscal_titular_condicao_ibs is
  'CADASTRO-PRODUTOR-01: a condição do produtor no IBS/CBS (Reforma), por vigência, com o motivo. Escrita só por '
  'fn_fiscal_titular_condicao_ibs_gravar; corrigir a versão marca substituida_em.';
create unique index fiscal_titular_condicao_ibs_uq on public.fiscal_titular_condicao_ibs (titular_id, vigencia_inicio)
  where substituida_em is null;

-- ── (7) o grupo: as PJs do produtor ─────────────────────────────────────────────────────────────────────────────────────────────
create table public.fiscal_titular_grupo (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  titular_id uuid not null references public.fiscal_titulares(id),
  empresa_id uuid not null references public.fiscal_titulares(id),
  participacao numeric(7,4) not null check (participacao > 0 and participacao <= 100),
  atividade text check (atividade is null or btrim(atividade) <> ''),
  entra_no_limite boolean not null default true,
  vigencia_inicio date not null,
  vigencia_fim date check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  substituida_em timestamptz,
  created_at timestamptz not null default now(),
  check (empresa_id <> titular_id)
);
comment on table public.fiscal_titular_grupo is
  'CADASTRO-PRODUTOR-01: as empresas (titulares PJ do mesmo cliente) de que o titular participa, com %, atividade e se a receita entra '
  'no limite da Reforma; por vigência, como a composição da fazenda. Escrita só por fn_fiscal_titular_grupo_gravar.';
create unique index fiscal_titular_grupo_uq on public.fiscal_titular_grupo (titular_id, empresa_id, vigencia_inicio)
  where substituida_em is null;

-- ── (9) os acordos de rateio e a ligação do lançamento ──────────────────────────────────────────────────────────────────────────
create table public.fiscal_acordos_rateio (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  nome text not null check (btrim(nome) <> ''),
  produtor_id uuid not null references public.fiscal_titulares(id),
  terceiro_id uuid not null references public.fiscal_titulares(id),
  fazenda_id uuid references public.fazendas(id),
  parte_produtor numeric(7,4) check (parte_produtor is null or (parte_produtor > 0 and parte_produtor <= 100)),
  documento_em text not null check (documento_em in ('produtor', 'terceiro', 'alterna')),
  como_paga text not null check (como_paga in ('transfere_ao_terceiro', 'direto')),
  palavras text[] not null default '{}',
  vigencia_inicio date not null,
  vigencia_fim date check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  ativo boolean not null default true,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (produtor_id <> terceiro_id)
);
comment on table public.fiscal_acordos_rateio is
  'CADASTRO-PRODUTOR-01: o acordo de rateio do produtor com um terceiro (ex. Rateio folha 50%, Supermercado BG 70%). O lançamento é o '
  'que sai da conta; o documento tem o valor cheio. parte_produtor nulo = "a confirmar" (D-P7): os lançamentos ligados não entram no '
  'livro até o % ser preenchido. palavras = o que a sugestão procura na descrição e no fornecedor. Escrita só por '
  'fn_fiscal_acordo_rateio_gravar.';
create unique index fiscal_acordos_rateio_nome_uq on public.fiscal_acordos_rateio (cliente_id, lower(nome)) where ativo;

create table public.fiscal_lancamento_acordo (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  lancamento_id uuid not null,
  acordo_id uuid not null references public.fiscal_acordos_rateio(id),
  percentual numeric(7,4) check (percentual is null or (percentual > 0 and percentual <= 100)),
  como text not null check (como in ('manual', 'pela_sugestao')),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  desfeita_em timestamptz,
  desfeita_por uuid,
  desfeita_motivo text,
  check ((desfeita_em is null) = (desfeita_motivo is null))
);
comment on table public.fiscal_lancamento_acordo is
  'CADASTRO-PRODUTOR-01: o lançamento ligado a um acordo de rateio, com o % do produtor congelado na ligação (nulo = a confirmar). Uma '
  'ligação viva por lançamento; desfazer marca desfeita_* (nada se apaga). Sem FK para financeiro_lancamentos_v2 (tabela de uso '
  'corrente; o gravador confere cliente e cancelamento, como o vínculo do PATR-01). Escrita só pelas fn_fiscal_lancamentos_acordo_*.';
create unique index fiscal_lancamento_acordo_viva_uq on public.fiscal_lancamento_acordo (lancamento_id) where desfeita_em is null;
create index fiscal_lancamento_acordo_acordo_idx on public.fiscal_lancamento_acordo (acordo_id) where desfeita_em is null;

-- ── acesso das tabelas novas ────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.fiscal_titular_ies enable row level security;
alter table public.fiscal_titular_condicao_ibs enable row level security;
alter table public.fiscal_titular_grupo enable row level security;
alter table public.fiscal_acordos_rateio enable row level security;
alter table public.fiscal_lancamento_acordo enable row level security;
create policy fiscal_titular_ies_ler on public.fiscal_titular_ies for select to authenticated using (public.tenant_ok(cliente_id));
create policy fiscal_titular_condicao_ibs_ler on public.fiscal_titular_condicao_ibs for select to authenticated using (public.tenant_ok(cliente_id));
create policy fiscal_titular_grupo_ler on public.fiscal_titular_grupo for select to authenticated using (public.tenant_ok(cliente_id));
create policy fiscal_acordos_rateio_ler on public.fiscal_acordos_rateio for select to authenticated using (public.tenant_ok(cliente_id));
create policy fiscal_lancamento_acordo_ler on public.fiscal_lancamento_acordo for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.fiscal_titular_ies, public.fiscal_titular_condicao_ibs, public.fiscal_titular_grupo, public.fiscal_acordos_rateio,
  public.fiscal_lancamento_acordo from public, anon, authenticated;
grant select on public.fiscal_titular_ies, public.fiscal_titular_condicao_ibs, public.fiscal_titular_grupo, public.fiscal_acordos_rateio,
  public.fiscal_lancamento_acordo to authenticated;
grant all on public.fiscal_titular_ies, public.fiscal_titular_condicao_ibs, public.fiscal_titular_grupo, public.fiscal_acordos_rateio,
  public.fiscal_lancamento_acordo to service_role;
create trigger trg_leitura_nao_grava before insert or delete or update on public.fiscal_titular_ies
  for each statement execute function public._fn_leitura_nao_grava();
create trigger trg_leitura_nao_grava before insert or delete or update on public.fiscal_titular_condicao_ibs
  for each statement execute function public._fn_leitura_nao_grava();
create trigger trg_leitura_nao_grava before insert or delete or update on public.fiscal_titular_grupo
  for each statement execute function public._fn_leitura_nao_grava();
create trigger trg_leitura_nao_grava before insert or delete or update on public.fiscal_acordos_rateio
  for each statement execute function public._fn_leitura_nao_grava();
create trigger trg_leitura_nao_grava before insert or delete or update on public.fiscal_lancamento_acordo
  for each statement execute function public._fn_leitura_nao_grava();

-- ── "cadastro incompleto": UMA regra (a prévia do gravador e a lista leem dela). Aviso, nunca bloqueio. ─────────────────────────
-- p = a ficha (papel, tipo, nascimento, email_fiscal, endereco, municipio, uf, cep, regime_ir, ies[]) + tem_fazenda + tem_condicao_ibs
create or replace function public._fn_fiscal_titular_pendencias(p jsonb)
returns text[] language sql immutable set search_path = pg_catalog as $$
  select case when p->>'papel' = 'terceiro' then '{}'::text[] else array_remove(array[
    case when coalesce(jsonb_array_length(p->'ies'), 0) = 0 then 'Sem inscrição estadual' end,
    case when p->>'tipo' = 'PF' and p->>'nascimento' is null then 'Sem data de nascimento' end,
    case when p->>'email_fiscal' is null then 'Sem e-mail fiscal' end,
    case when p->>'endereco' is null or p->>'municipio' is null or p->>'uf' is null or p->>'cep' is null
         then 'Endereço fiscal incompleto' end,
    case when p->>'regime_ir' is null then 'Sem regime do IR' end,
    case when not coalesce((p->>'tem_fazenda')::boolean, false) then 'Sem fazenda' end,
    case when not coalesce((p->>'tem_condicao_ibs')::boolean, false) then 'Sem condição no IBS/CBS' end
  ], null) end
$$;

-- ── (2)(3) o titular: criar ou editar a ficha inteira ──────────────────────────────────────────────────────────────────────────
create or replace function public.fn_fiscal_titular_gravar(p_cliente_id uuid, p_titular_id uuid, p_dados jsonb, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  t public.fiscal_titulares; v_nome text; v_doc text; v_tipo text; v_fmt text; v_papel text; v_cnpjp text; v_nasc date;
  v_email text; v_end text; v_mun text; v_uf text; v_cep text; v_reg text; v_ativo boolean; v_raw text;
  v_ies jsonb := '[]'::jsonb; v_ies_antes jsonb; e jsonb; v_ie text; v_ie_uf text; v_ie_faz uuid;
  v_outro text; v_faz text; v_antes jsonb; v_depois jsonb; v_dif jsonb := '[]'::jsonb; k text; v_id uuid; v_ficha jsonb;
  v_contas int := 0; v_tem_faz boolean := false; v_tem_ibs boolean := false;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  c_ufs constant text[] := array['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN',
                                 'RO','RR','RS','SC','SE','SP','TO'];
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este cliente.';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Informe os dados do titular.'; end if;
  if p_titular_id is not null then
    select * into t from public.fiscal_titulares where id = p_titular_id;
    if t.id is null or t.cliente_id <> p_cliente_id then raise exception 'Titular não encontrado neste cliente.'; end if;
  end if;

  -- identidade (obrigatória)
  v_nome := coalesce(public._fn_fiscal_campo_texto(p_dados, 'nome', t.nome), '');
  if v_nome = '' then raise exception 'Informe o nome do titular.'; end if;
  v_doc := public._fn_documento_normalizar(case when p_dados ? 'documento' then p_dados->>'documento' else t.documento end);
  if v_doc = '' then raise exception 'Informe o CPF ou o CNPJ do titular.'; end if;
  if length(v_doc) not in (11, 14) then raise exception 'CPF/CNPJ: informe 11 dígitos (CPF) ou 14 posições (CNPJ).'; end if;
  if length(v_doc) = 11 and v_doc !~ '^[0-9]{11}$' then raise exception 'O CPF só tem dígitos.'; end if;
  v_tipo := case when length(v_doc) = 11 then 'CPF' else 'CNPJ' end;
  v_fmt := public._fn_cpf_cnpj_formatado(v_doc);
  if not public._fn_cpf_cnpj_valido(v_doc) then
    raise exception '%', format('O %s %s não é válido: confira os dígitos.', v_tipo, v_fmt);
  end if;
  v_papel := coalesce(case when p_dados ? 'papel' then p_dados->>'papel' end, t.papel, 'produtor');
  if v_papel not in ('produtor', 'terceiro') then raise exception 'Papel: produtor ou terceiro (parceiro de rateio).'; end if;

  -- o resto da ficha (opcional: faltar é aviso)
  if p_dados ? 'cnpj_produtor' then
    v_cnpjp := nullif(public._fn_documento_normalizar(p_dados->>'cnpj_produtor'), '');
  else
    v_cnpjp := t.cnpj_produtor;
  end if;
  if v_cnpjp is not null then
    if v_tipo <> 'CPF' then raise exception 'O CNPJ do produtor é só para pessoa física (o titular já é um CNPJ).'; end if;
    if length(v_cnpjp) <> 14 or not public._fn_cpf_cnpj_valido(v_cnpjp) then
      raise exception '%', format('O CNPJ do produtor %s não é válido: confira os dígitos.', public._fn_cpf_cnpj_formatado(v_cnpjp));
    end if;
  end if;
  if p_dados ? 'nascimento' then
    v_raw := nullif(btrim(coalesce(p_dados->>'nascimento', '')), '');
    if v_raw is not null and v_raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Data de nascimento: use dd/mm/aaaa.'; end if;
    begin
      v_nasc := v_raw::date;
    exception when others then
      raise exception 'Data de nascimento: use dd/mm/aaaa.';
    end;
  else
    v_nasc := t.nascimento;
  end if;
  if v_nasc is not null then
    if v_tipo <> 'CPF' then raise exception 'Data de nascimento é só para pessoa física.'; end if;
    if v_nasc < date '1900-01-01' or v_nasc > v_hoje then raise exception 'Data de nascimento fora do possível: confira.'; end if;
  end if;
  v_email := lower(public._fn_fiscal_campo_texto(p_dados, 'email_fiscal', t.email_fiscal));
  if v_email is not null and v_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception '%', format('"%s" não parece um e-mail.', v_email);
  end if;
  v_end := public._fn_fiscal_campo_texto(p_dados, 'endereco', t.endereco);
  v_mun := public._fn_fiscal_campo_texto(p_dados, 'municipio', t.municipio);
  v_uf := upper(public._fn_fiscal_campo_texto(p_dados, 'uf', t.uf));
  if v_uf is not null and not (v_uf = any (c_ufs)) then raise exception '%', format('"%s" não é uma UF.', v_uf); end if;
  if p_dados ? 'cep' then
    v_cep := nullif(regexp_replace(coalesce(p_dados->>'cep', ''), '\D', '', 'g'), '');
  else
    v_cep := t.cep;
  end if;
  if v_cep is not null and length(v_cep) <> 8 then raise exception 'CEP: 8 dígitos.'; end if;
  v_reg := case when p_dados ? 'regime_ir' then nullif(btrim(coalesce(p_dados->>'regime_ir', '')), '') else t.regime_ir end;
  if v_reg is not null then
    if v_reg not in ('pf_atividade_rural', 'pj_presumido', 'pj_real', 'pj_simples') then
      raise exception 'Regime do IR: atividade rural (PF), presumido, real ou Simples (PJ).';
    end if;
    if (v_tipo = 'CPF') <> (v_reg = 'pf_atividade_rural') then
      raise exception '%', case when v_tipo = 'CPF' then 'Pessoa física: o regime é o da atividade rural (a escolha real × 20% é na declaração).'
                                else 'Pessoa jurídica: presumido, real ou Simples.' end;
    end if;
  end if;
  if p_dados ? 'ativo' then
    if jsonb_typeof(p_dados->'ativo') <> 'boolean' then raise exception 'Ativo: use verdadeiro ou falso.'; end if;
    v_ativo := (p_dados->>'ativo')::boolean;
  else
    v_ativo := coalesce(t.ativo, true);
  end if;

  -- as IEs (a lista inteira; ausente = mantém)
  select coalesce(jsonb_agg(jsonb_build_object('uf', i.uf, 'ie', i.ie, 'fazenda_id', i.fazenda_id) order by i.uf, i.ie), '[]'::jsonb)
    into v_ies_antes from public.fiscal_titular_ies i where i.titular_id = t.id and i.ativo;
  if p_dados ? 'ies' then
    if jsonb_typeof(p_dados->'ies') <> 'array' then raise exception 'IEs: informe uma lista.'; end if;
    for e in select * from jsonb_array_elements(p_dados->'ies') loop
      v_ie := upper(regexp_replace(coalesce(e->>'ie', ''), '[^0-9A-Za-z]', '', 'g'));
      v_ie_uf := upper(btrim(coalesce(e->>'uf', '')));
      if not (v_ie_uf = any (c_ufs)) then raise exception '%', format('IE %s: informe a UF.', coalesce(e->>'ie', '')); end if;
      if v_ie !~ '^P?[0-9]{8,14}$' then raise exception '%', format('"%s" não parece uma inscrição estadual.', coalesce(e->>'ie', '')); end if;
      v_ie_faz := null;
      if nullif(e->>'fazenda_id', '') is not null then
        if e->>'fazenda_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or not exists (select 1 from public.fazendas f where f.id = (e->>'fazenda_id')::uuid and f.cliente_id = p_cliente_id) then
          raise exception '%', format('IE %s: fazenda não encontrada neste cliente.', v_ie);
        end if;
        v_ie_faz := (e->>'fazenda_id')::uuid;
      end if;
      if exists (select 1 from jsonb_array_elements(v_ies) x where x->>'uf' = v_ie_uf and x->>'ie' = v_ie) then
        raise exception '%', format('A IE %s/%s aparece duas vezes.', v_ie, v_ie_uf);
      end if;
      v_ies := v_ies || jsonb_build_array(jsonb_build_object('uf', v_ie_uf, 'ie', v_ie, 'fazenda_id', v_ie_faz));
    end loop;
    select coalesce(jsonb_agg(x order by x->>'uf', x->>'ie'), '[]'::jsonb) into v_ies from jsonb_array_elements(v_ies) x;
  else
    v_ies := v_ies_antes;
  end if;

  select x.nome into v_outro from public.fiscal_titulares x
   where x.cliente_id = p_cliente_id and x.documento = v_doc and x.id is distinct from t.id limit 1;
  if v_outro is not null then raise exception '%', format('O %s %s já é do titular %s.', v_tipo, v_fmt, v_outro); end if;

  if t.id is not null and v_doc <> t.documento then
    if exists (select 1 from public.fiscal_fazenda_titulares ft where ft.titular_id = t.id and ft.substituida_em is null)
       or exists (select 1 from public.fiscal_acordos_rateio a where t.id in (a.produtor_id, a.terceiro_id))
       or exists (select 1 from public.financeiro_contas_bancarias b where b.cliente_id = p_cliente_id and b.titular_documento = t.documento) then
      raise exception 'O CPF/CNPJ de um titular com fazenda, acordo ou conta bancária não muda: cadastre outro titular.';
    end if;
  end if;
  if t.id is not null and v_papel <> t.papel then
    if exists (select 1 from public.fiscal_acordos_rateio a where a.ativo
                  and ((t.papel = 'produtor' and a.produtor_id = t.id) or (t.papel = 'terceiro' and a.terceiro_id = t.id))) then
      raise exception '%', format('%s está num acordo de rateio como %s: encerre o acordo antes de trocar o papel.', v_nome, t.papel);
    end if;
    if v_papel = 'terceiro' and exists (select 1 from public.fiscal_titular_condicao_ibs c where c.titular_id = t.id and c.substituida_em is null) then
      raise exception '%', format('%s tem condição no IBS/CBS: o terceiro não tem; corrija antes.', v_nome);
    end if;
  end if;
  if t.id is not null and t.ativo and not v_ativo then
    select string_agg(distinct f.nome, ', ') into v_faz
      from public.fiscal_fazenda_titulares ft join public.fazendas f on f.id = ft.fazenda_id
     where ft.titular_id = t.id and ft.substituida_em is null and (ft.vigencia_fim is null or ft.vigencia_fim >= v_hoje);
    if v_faz is not null then
      raise exception '%', format('%s tem participação vigente em %s: encerre a participação antes de inativar.', v_nome, v_faz);
    end if;
    select string_agg(a.nome, ', ') into v_faz from public.fiscal_acordos_rateio a where a.ativo and t.id in (a.produtor_id, a.terceiro_id);
    if v_faz is not null then
      raise exception '%', format('%s está no acordo %s: encerre o acordo antes de inativar.', v_nome, v_faz);
    end if;
    select string_agg(coalesce(b.nome_exibicao, b.nome_conta), ', ') into v_faz from public.financeiro_contas_bancarias b
     where b.cliente_id = p_cliente_id and b.titular_documento = t.documento;
    if v_faz is not null then
      raise exception '%', format('%s é o titular da conta %s: desligue a conta antes de inativar.', v_nome, v_faz);
    end if;
  end if;

  v_antes := case when t.id is null then null else jsonb_build_object('nome', t.nome, 'documento', t.documento, 'papel', t.papel,
    'cnpj_produtor', t.cnpj_produtor, 'nascimento', t.nascimento, 'email_fiscal', t.email_fiscal, 'endereco', t.endereco,
    'municipio', t.municipio, 'uf', t.uf, 'cep', t.cep, 'regime_ir', t.regime_ir, 'ativo', t.ativo, 'ies', v_ies_antes) end;
  v_depois := jsonb_build_object('nome', v_nome, 'documento', v_doc, 'papel', v_papel, 'cnpj_produtor', v_cnpjp, 'nascimento', v_nasc,
    'email_fiscal', v_email, 'endereco', v_end, 'municipio', v_mun, 'uf', v_uf, 'cep', v_cep, 'regime_ir', v_reg, 'ativo', v_ativo,
    'ies', v_ies);
  foreach k in array array['nome', 'documento', 'papel', 'cnpj_produtor', 'nascimento', 'email_fiscal', 'endereco', 'municipio', 'uf',
                           'cep', 'regime_ir', 'ativo', 'ies'] loop
    if (v_antes->k) is distinct from (v_depois->k) then
      v_dif := v_dif || jsonb_build_array(jsonb_build_object('campo', k, 'antes', v_antes->k, 'depois', v_depois->k));
    end if;
  end loop;
  if t.id is not null then
    v_tem_faz := exists (select 1 from public.fiscal_fazenda_titulares ft where ft.titular_id = t.id and ft.substituida_em is null
                            and (ft.vigencia_fim is null or ft.vigencia_fim >= v_hoje));
    v_tem_ibs := exists (select 1 from public.fiscal_titular_condicao_ibs c where c.titular_id = t.id and c.substituida_em is null
                            and (c.vigencia_fim is null or c.vigencia_fim >= v_hoje));
  end if;
  v_ficha := v_depois || jsonb_build_object('tipo', case when v_tipo = 'CPF' then 'PF' else 'PJ' end,
                                            'tem_fazenda', v_tem_faz, 'tem_condicao_ibs', v_tem_ibs);

  if p_simular or jsonb_array_length(v_dif) = 0 then
    return jsonb_build_object('simulado', p_simular, 'gravado', false, 'titular_id', t.id, 'tipo', v_tipo,
      'documento_formatado', v_fmt, 'diferencas', v_dif, 'pendencias', to_jsonb(public._fn_fiscal_titular_pendencias(v_ficha)),
      'frase', case when jsonb_array_length(v_dif) = 0 then format('%s: nada muda.', v_nome)
                    when t.id is null then format('Cria o %s %s (%s %s).', case when v_papel = 'terceiro' then 'terceiro' else 'produtor' end,
                                                  v_nome, v_tipo, v_fmt)
                    else format('Atualiza %s (%s %s).', v_nome, v_tipo, v_fmt) end);
  end if;

  if t.id is null then
    insert into public.fiscal_titulares (cliente_id, nome, documento, papel, cnpj_produtor, nascimento, email_fiscal, endereco, municipio,
                                         uf, cep, regime_ir, ativo)
    values (p_cliente_id, v_nome, v_doc, v_papel, v_cnpjp, v_nasc, v_email, v_end, v_mun, v_uf, v_cep, v_reg, v_ativo)
    returning id into v_id;
  else
    update public.fiscal_titulares set nome = v_nome, documento = v_doc, papel = v_papel, cnpj_produtor = v_cnpjp, nascimento = v_nasc,
           email_fiscal = v_email, endereco = v_end, municipio = v_mun, uf = v_uf, cep = v_cep, regime_ir = v_reg, ativo = v_ativo,
           updated_at = now()
     where id = t.id;
    v_id := t.id;
  end if;
  if v_ies is distinct from v_ies_antes then
    update public.fiscal_titular_ies i set ativo = false, updated_at = now()
     where i.titular_id = v_id and i.ativo
       and not exists (select 1 from jsonb_array_elements(v_ies) x where x->>'uf' = i.uf and x->>'ie' = i.ie);
    insert into public.fiscal_titular_ies (cliente_id, titular_id, uf, ie, fazenda_id)
    select p_cliente_id, v_id, x->>'uf', x->>'ie', nullif(x->>'fazenda_id', '')::uuid from jsonb_array_elements(v_ies) x
    on conflict (titular_id, uf, ie) do update set ativo = true, fazenda_id = excluded.fazenda_id, updated_at = now()
     where fiscal_titular_ies.ativo is distinct from true or fiscal_titular_ies.fazenda_id is distinct from excluded.fazenda_id;
  end if;
  -- o nome do titular nas contas ligadas a ele (o dono do titular_nome é o cadastro do produtor)
  if t.id is not null and v_nome <> t.nome then
    perform set_config('app.fiscal_conta_titular', 'on', true);
    update public.financeiro_contas_bancarias b set titular_nome = v_nome
     where b.cliente_id = p_cliente_id and b.titular_documento = v_doc and b.titular_nome is distinct from v_nome;
    get diagnostics v_contas = row_count;
    perform set_config('app.fiscal_conta_titular', '', true);
  end if;
  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (p_cliente_id, auth.uid(), 'fiscal', case when t.id is null then 'criou' else 'editou' end, 'fiscal_titulares', v_id,
    format('%s %s (%s %s)%s', case when v_papel = 'terceiro' then 'Terceiro' else 'Produtor' end, v_nome, v_tipo, v_fmt,
           case when t.id is null then ' criado' else ' editado' end),
    v_antes, v_depois, public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'titular_id', v_id, 'tipo', v_tipo,
    'documento_formatado', v_fmt, 'diferencas', v_dif, 'contas_renomeadas', v_contas,
    'pendencias', to_jsonb(public._fn_fiscal_titular_pendencias(v_ficha)));
end $$;

-- ── (4) a composição da fazenda a partir de uma data (lista vazia = a fazenda fica sem titular a partir dela) ─────────────────
create or replace function public.fn_fiscal_fazenda_titulares_gravar(p_fazenda_id uuid, p_inicio date, p_titulares jsonb,
                                                                      p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  f public.fazendas; e jsonb; v_tid uuid; v_pct numeric; t public.fiscal_titulares; v_soma numeric := 0; v_cond text; v_reg text;
  v_novos jsonb := '[]'::jsonb; v_antes jsonb; v_ini_vig date; v_fim_mesma date; v_mesma boolean; v_depois_ord jsonb;
  v_conflito date; v_fecha date; v_avisos jsonb := '[]'::jsonb; v_n_prod int := 0; v_n_parte int := 0;
begin
  select * into f from public.fazendas where id = p_fazenda_id;
  if f.id is null or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a esta fazenda.';
  end if;
  if p_inicio is null then raise exception 'Informe o início da vigência.'; end if;
  if p_titulares is null or jsonb_typeof(p_titulares) <> 'array' then raise exception 'Informe a lista de titulares.'; end if;

  for e in select * from jsonb_array_elements(p_titulares) loop
    if coalesce(e->>'titular_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Titular não encontrado neste cliente.';
    end if;
    v_tid := (e->>'titular_id')::uuid;
    select * into t from public.fiscal_titulares where id = v_tid;
    if t.id is null or t.cliente_id <> f.cliente_id then raise exception 'Titular não encontrado neste cliente.'; end if;
    if not t.ativo then raise exception '%', format('O titular %s está inativo.', t.nome); end if;
    if v_novos @> jsonb_build_array(jsonb_build_object('titular_id', v_tid)) then
      raise exception '%', format('O titular %s aparece duas vezes.', t.nome);
    end if;
    if coalesce(e->>'participacao', '') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception '%', format('Participação de %s: use um número de 0 a 100.', t.nome);
    end if;
    v_pct := round((e->>'participacao')::numeric, 4);
    if v_pct <= 0 or v_pct > 100 then raise exception '%', format('Participação de %s: de 0 a 100%%.', t.nome); end if;
    v_cond := coalesce(nullif(e->>'condicao', ''), 'proprietario');
    if v_cond not in ('proprietario', 'condomino', 'arrendatario', 'parceiro', 'comodatario') then
      raise exception '%', format('Condição de %s: proprietário, condômino, arrendatário, parceiro ou comodatário.', t.nome);
    end if;
    v_reg := coalesce(nullif(e->>'registra', ''), 'total');
    if v_reg not in ('total', 'so_a_parte') then
      raise exception '%', format('O que o financeiro registra para %s: o total da fazenda ou só a parte.', t.nome);
    end if;
    if t.papel = 'terceiro' then
      v_reg := 'total';  -- o terceiro não tem financeiro no cliente: a participação dele é só dado do imóvel
    else
      v_n_prod := v_n_prod + 1;
      if v_reg = 'so_a_parte' then v_n_parte := v_n_parte + 1; end if;
    end if;
    v_soma := v_soma + v_pct;
    v_novos := v_novos || jsonb_build_array(jsonb_build_object('titular_id', v_tid, 'nome', t.nome, 'participacao', v_pct,
                                                               'condicao', v_cond, 'registra', v_reg));
  end loop;
  if jsonb_array_length(v_novos) > 0 and v_soma <> 100 then
    v_avisos := v_avisos || to_jsonb(format('A soma de %s é %s%% (não 100%%): confira se falta alguém ou se é assim mesmo.',
                                            f.nome, replace(trim_scale(v_soma)::text, '.', ',')));
  end if;
  if v_n_parte > 0 and v_n_parte < v_n_prod then
    v_avisos := v_avisos || to_jsonb(format('Em %s, o financeiro registra só a parte de um produtor e o total para outro: confira (o '
                                            'livro nunca divide duas vezes).', f.nome));
  elsif v_n_parte > 1 then
    v_avisos := v_avisos || to_jsonb(format('Em %s, %s produtores com "só a parte": o financeiro da fazenda é a soma das partes deles?',
                                            f.nome, v_n_parte));
  end if;

  -- só a última versão se corrige, e a nova começa depois dela: nada no meio de uma vigência já gravada
  select max(vigencia_inicio) into v_conflito from public.fiscal_fazenda_titulares
   where fazenda_id = f.id and substituida_em is null and vigencia_inicio > p_inicio;
  if v_conflito is not null then
    raise exception '%', format('A composição de %s já tem uma versão a partir de %s: a nova começa nessa data (para corrigi-la) ou depois.',
      f.nome, to_char(v_conflito, 'DD/MM/YYYY'));
  end if;
  select max(vigencia_fim) into v_conflito from public.fiscal_fazenda_titulares
   where fazenda_id = f.id and substituida_em is null and vigencia_inicio < p_inicio and vigencia_fim >= p_inicio;
  if v_conflito is not null then
    raise exception '%', format('A composição de %s vai até %s: a nova começa depois.', f.nome, to_char(v_conflito, 'DD/MM/YYYY'));
  end if;

  -- o que vale em p_inicio hoje
  select max(vigencia_inicio) into v_ini_vig from public.fiscal_fazenda_titulares
   where fazenda_id = f.id and substituida_em is null and vigencia_inicio <= p_inicio
     and (vigencia_fim is null or vigencia_fim >= p_inicio);
  select coalesce(jsonb_agg(jsonb_build_object('titular_id', ft.titular_id, 'nome', x.nome, 'participacao', ft.participacao,
                                               'condicao', ft.condicao, 'registra', ft.registra)
                            order by ft.titular_id), '[]'::jsonb)
    into v_antes
    from public.fiscal_fazenda_titulares ft join public.fiscal_titulares x on x.id = ft.titular_id
   where ft.fazenda_id = f.id and ft.substituida_em is null and ft.vigencia_inicio = v_ini_vig;
  v_mesma := v_ini_vig = p_inicio;
  select max(vigencia_fim) into v_fim_mesma from public.fiscal_fazenda_titulares
   where fazenda_id = f.id and substituida_em is null and vigencia_inicio = p_inicio;
  select coalesce(jsonb_agg(n order by (n->>'titular_id')::uuid), '[]'::jsonb) into v_depois_ord from jsonb_array_elements(v_novos) n;

  if p_simular or v_antes = v_depois_ord then
    return jsonb_build_object('simulado', p_simular, 'gravado', false, 'fazenda', f.nome, 'inicio', p_inicio,
      'antes', v_antes, 'depois', v_depois_ord, 'corrige_a_versao', coalesce(v_mesma, false), 'avisos', v_avisos,
      'anterior_termina', case when v_ini_vig is not null and not coalesce(v_mesma, false) then p_inicio - 1 end,
      'frase', case when v_antes = v_depois_ord then format('%s: nada muda a partir de %s.', f.nome, to_char(p_inicio, 'DD/MM/YYYY'))
                    when jsonb_array_length(v_novos) = 0 then format('%s fica sem titular a partir de %s.', f.nome, to_char(p_inicio, 'DD/MM/YYYY'))
                    else format('%s: nova composição a partir de %s.', f.nome, to_char(p_inicio, 'DD/MM/YYYY')) end);
  end if;

  if coalesce(v_mesma, false) then
    update public.fiscal_fazenda_titulares set substituida_em = now()
     where fazenda_id = f.id and substituida_em is null and vigencia_inicio = p_inicio;
    v_fecha := v_fim_mesma;
  else
    update public.fiscal_fazenda_titulares set vigencia_fim = p_inicio - 1
     where fazenda_id = f.id and substituida_em is null and vigencia_inicio = v_ini_vig;
    v_fecha := null;
  end if;
  insert into public.fiscal_fazenda_titulares (cliente_id, fazenda_id, titular_id, participacao, vigencia_inicio, vigencia_fim, condicao, registra)
  select f.cliente_id, f.id, (n->>'titular_id')::uuid, (n->>'participacao')::numeric, p_inicio, v_fecha, n->>'condicao', n->>'registra'
    from jsonb_array_elements(v_novos) n;
  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo,
                                dados_anteriores, dados_novos, via)
  values (f.cliente_id, f.id, auth.uid(), 'fiscal', 'editou', 'fiscal_fazenda_titulares', f.id,
    format('%s · titulares a partir de %s%s', f.nome, to_char(p_inicio, 'DD/MM/YYYY'),
           case when coalesce(v_mesma, false) then ' (corrige a composição desta data)' else '' end),
    jsonb_build_object('inicio', v_ini_vig, 'titulares', v_antes),
    jsonb_build_object('inicio', p_inicio, 'titulares', v_depois_ord, 'avisos', v_avisos), public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'fazenda', f.nome, 'inicio', p_inicio,
    'antes', v_antes, 'depois', v_depois_ord, 'corrige_a_versao', coalesce(v_mesma, false), 'avisos', v_avisos);
end $$;

-- ── (6) a condição no IBS/CBS a partir de uma data ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_fiscal_titular_condicao_ibs_gravar(p_titular_id uuid, p_inicio date, p_condicao text, p_motivo text,
                                                                         p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  t public.fiscal_titulares; a public.fiscal_titular_condicao_ibs; v_conf date; v_motivo text := btrim(coalesce(p_motivo, ''));
  v_mesma boolean; v_id uuid;
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null or not coalesce(public.tenant_ok(t.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este titular.';
  end if;
  if t.papel <> 'produtor' then raise exception 'A condição no IBS/CBS é só do produtor.'; end if;
  if not t.ativo then raise exception '%', format('O titular %s está inativo.', t.nome); end if;
  if p_inicio is null then raise exception 'Informe o início da vigência.'; end if;
  if coalesce(p_condicao, '') not in ('nao_contribuinte', 'contribuinte_pelo_limite', 'optante', 'integrado') then
    raise exception 'Condição: não contribuinte, contribuinte pelo limite, optante ou integrado.';
  end if;
  if length(v_motivo) < 3 then raise exception 'Diga o motivo (pelo menos 3 letras).'; end if;

  select max(vigencia_inicio) into v_conf from public.fiscal_titular_condicao_ibs
   where titular_id = t.id and substituida_em is null and vigencia_inicio > p_inicio;
  if v_conf is not null then
    raise exception '%', format('A condição de %s já tem uma versão a partir de %s: a nova começa nessa data (para corrigi-la) ou depois.',
      t.nome, to_char(v_conf, 'DD/MM/YYYY'));
  end if;
  select * into a from public.fiscal_titular_condicao_ibs
   where titular_id = t.id and substituida_em is null and vigencia_inicio <= p_inicio
     and (vigencia_fim is null or vigencia_fim >= p_inicio)
   order by vigencia_inicio desc limit 1;
  v_mesma := a.vigencia_inicio = p_inicio;

  if p_simular or a.condicao is not distinct from p_condicao then
    return jsonb_build_object('simulado', p_simular, 'gravado', false, 'titular', t.nome, 'inicio', p_inicio,
      'antes', case when a.id is null then null else jsonb_build_object('condicao', a.condicao, 'inicio', a.vigencia_inicio) end,
      'depois', jsonb_build_object('condicao', p_condicao, 'inicio', p_inicio), 'corrige_a_versao', coalesce(v_mesma, false),
      'anterior_termina', case when a.id is not null and not coalesce(v_mesma, false) then p_inicio - 1 end,
      'frase', case when a.condicao is not distinct from p_condicao then format('%s: nada muda a partir de %s.', t.nome, to_char(p_inicio, 'DD/MM/YYYY'))
                    else format('%s: nova condição no IBS/CBS a partir de %s.', t.nome, to_char(p_inicio, 'DD/MM/YYYY')) end);
  end if;

  if coalesce(v_mesma, false) then
    update public.fiscal_titular_condicao_ibs set substituida_em = now() where id = a.id;
  elsif a.id is not null then
    update public.fiscal_titular_condicao_ibs set vigencia_fim = p_inicio - 1 where id = a.id;
  end if;
  insert into public.fiscal_titular_condicao_ibs (cliente_id, titular_id, condicao, vigencia_inicio, vigencia_fim, motivo, criado_por)
  values (t.cliente_id, t.id, p_condicao, p_inicio, case when coalesce(v_mesma, false) then a.vigencia_fim end, v_motivo, auth.uid())
  returning id into v_id;
  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (t.cliente_id, auth.uid(), 'fiscal', 'editou', 'fiscal_titular_condicao_ibs', t.id,
    format('%s · condição no IBS/CBS a partir de %s%s', t.nome, to_char(p_inicio, 'DD/MM/YYYY'),
           case when coalesce(v_mesma, false) then ' (corrige a desta data)' else '' end),
    case when a.id is null then null else jsonb_build_object('condicao', a.condicao, 'inicio', a.vigencia_inicio) end,
    jsonb_build_object('condicao', p_condicao, 'inicio', p_inicio, 'motivo', v_motivo), public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'titular', t.nome, 'inicio', p_inicio, 'id', v_id,
    'corrige_a_versao', coalesce(v_mesma, false));
end $$;

-- ── (7) o grupo do titular a partir de uma data (lista vazia = sem empresas a partir dela) ─────────────────────────────────────
create or replace function public.fn_fiscal_titular_grupo_gravar(p_titular_id uuid, p_inicio date, p_empresas jsonb,
                                                                  p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  t public.fiscal_titulares; x public.fiscal_titulares; e jsonb; v_eid uuid; v_pct numeric; v_ativ text; v_lim boolean;
  v_novos jsonb := '[]'::jsonb; v_antes jsonb; v_depois jsonb; v_ini_vig date; v_fim_mesma date; v_mesma boolean; v_conf date; v_fecha date;
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null or not coalesce(public.tenant_ok(t.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este titular.';
  end if;
  if t.papel <> 'produtor' then raise exception 'O grupo é só do produtor.'; end if;
  if p_inicio is null then raise exception 'Informe o início da vigência.'; end if;
  if p_empresas is null or jsonb_typeof(p_empresas) <> 'array' then raise exception 'Informe a lista de empresas.'; end if;

  for e in select * from jsonb_array_elements(p_empresas) loop
    if coalesce(e->>'empresa_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Empresa não encontrada neste cliente.';
    end if;
    v_eid := (e->>'empresa_id')::uuid;
    select * into x from public.fiscal_titulares where id = v_eid;
    if x.id is null or x.cliente_id <> t.cliente_id then raise exception 'Empresa não encontrada neste cliente.'; end if;
    if x.id = t.id then raise exception 'O titular não é empresa do próprio grupo.'; end if;
    if x.tipo <> 'PJ' or x.papel <> 'produtor' then
      raise exception '%', format('%s não é uma empresa (CNPJ) produtora deste cliente.', x.nome);
    end if;
    if not x.ativo then raise exception '%', format('A empresa %s está inativa.', x.nome); end if;
    if v_novos @> jsonb_build_array(jsonb_build_object('empresa_id', v_eid)) then
      raise exception '%', format('A empresa %s aparece duas vezes.', x.nome);
    end if;
    if coalesce(e->>'participacao', '') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception '%', format('Participação em %s: use um número de 0 a 100.', x.nome);
    end if;
    v_pct := round((e->>'participacao')::numeric, 4);
    if v_pct <= 0 or v_pct > 100 then raise exception '%', format('Participação em %s: de 0 a 100%%.', x.nome); end if;
    v_ativ := nullif(btrim(regexp_replace(coalesce(e->>'atividade', ''), '\s+', ' ', 'g')), '');
    if e ? 'entra_no_limite' and jsonb_typeof(e->'entra_no_limite') <> 'boolean' then
      raise exception '%', format('%s: "entra no limite" é sim ou não.', x.nome);
    end if;
    v_lim := coalesce((e->>'entra_no_limite')::boolean, true);
    v_novos := v_novos || jsonb_build_array(jsonb_build_object('empresa_id', v_eid, 'nome', x.nome, 'participacao', v_pct,
                                                               'atividade', v_ativ, 'entra_no_limite', v_lim));
  end loop;

  select max(vigencia_inicio) into v_conf from public.fiscal_titular_grupo
   where titular_id = t.id and substituida_em is null and vigencia_inicio > p_inicio;
  if v_conf is not null then
    raise exception '%', format('O grupo de %s já tem uma versão a partir de %s: a nova começa nessa data (para corrigi-la) ou depois.',
      t.nome, to_char(v_conf, 'DD/MM/YYYY'));
  end if;
  select max(vigencia_fim) into v_conf from public.fiscal_titular_grupo
   where titular_id = t.id and substituida_em is null and vigencia_inicio < p_inicio and vigencia_fim >= p_inicio;
  if v_conf is not null then
    raise exception '%', format('O grupo de %s vai até %s: a nova versão começa depois.', t.nome, to_char(v_conf, 'DD/MM/YYYY'));
  end if;
  select max(vigencia_inicio) into v_ini_vig from public.fiscal_titular_grupo
   where titular_id = t.id and substituida_em is null and vigencia_inicio <= p_inicio
     and (vigencia_fim is null or vigencia_fim >= p_inicio);
  select coalesce(jsonb_agg(jsonb_build_object('empresa_id', g.empresa_id, 'nome', y.nome, 'participacao', g.participacao,
                                               'atividade', g.atividade, 'entra_no_limite', g.entra_no_limite) order by g.empresa_id), '[]'::jsonb)
    into v_antes
    from public.fiscal_titular_grupo g join public.fiscal_titulares y on y.id = g.empresa_id
   where g.titular_id = t.id and g.substituida_em is null and g.vigencia_inicio = v_ini_vig;
  v_mesma := v_ini_vig = p_inicio;
  select max(vigencia_fim) into v_fim_mesma from public.fiscal_titular_grupo
   where titular_id = t.id and substituida_em is null and vigencia_inicio = p_inicio;
  select coalesce(jsonb_agg(n order by (n->>'empresa_id')::uuid), '[]'::jsonb) into v_depois from jsonb_array_elements(v_novos) n;

  if p_simular or v_antes = v_depois then
    return jsonb_build_object('simulado', p_simular, 'gravado', false, 'titular', t.nome, 'inicio', p_inicio,
      'antes', v_antes, 'depois', v_depois, 'corrige_a_versao', coalesce(v_mesma, false),
      'anterior_termina', case when v_ini_vig is not null and not coalesce(v_mesma, false) then p_inicio - 1 end,
      'frase', case when v_antes = v_depois then format('%s: o grupo não muda a partir de %s.', t.nome, to_char(p_inicio, 'DD/MM/YYYY'))
                    when jsonb_array_length(v_novos) = 0 then format('%s fica sem empresas a partir de %s.', t.nome, to_char(p_inicio, 'DD/MM/YYYY'))
                    else format('%s: novo grupo a partir de %s.', t.nome, to_char(p_inicio, 'DD/MM/YYYY')) end);
  end if;

  if coalesce(v_mesma, false) then
    update public.fiscal_titular_grupo set substituida_em = now()
     where titular_id = t.id and substituida_em is null and vigencia_inicio = p_inicio;
    v_fecha := v_fim_mesma;
  else
    update public.fiscal_titular_grupo set vigencia_fim = p_inicio - 1
     where titular_id = t.id and substituida_em is null and vigencia_inicio = v_ini_vig;
    v_fecha := null;
  end if;
  insert into public.fiscal_titular_grupo (cliente_id, titular_id, empresa_id, participacao, atividade, entra_no_limite, vigencia_inicio, vigencia_fim)
  select t.cliente_id, t.id, (n->>'empresa_id')::uuid, (n->>'participacao')::numeric, n->>'atividade', (n->>'entra_no_limite')::boolean,
         p_inicio, v_fecha
    from jsonb_array_elements(v_novos) n;
  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (t.cliente_id, auth.uid(), 'fiscal', 'editou', 'fiscal_titular_grupo', t.id,
    format('%s · grupo a partir de %s%s', t.nome, to_char(p_inicio, 'DD/MM/YYYY'),
           case when coalesce(v_mesma, false) then ' (corrige o desta data)' else '' end),
    jsonb_build_object('inicio', v_ini_vig, 'empresas', v_antes), jsonb_build_object('inicio', p_inicio, 'empresas', v_depois),
    public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'titular', t.nome, 'inicio', p_inicio,
    'antes', v_antes, 'depois', v_depois, 'corrige_a_versao', coalesce(v_mesma, false));
end $$;

-- ── (8) o titular da conta bancária: um dono só ────────────────────────────────────────────────────────────────────────────────
create or replace function public._fn_conta_titular_um_dono()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if coalesce(current_setting('app.fiscal_conta_titular', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.titular_nome is null and new.titular_documento is null then return new; end if;
  elsif new.titular_nome is not distinct from old.titular_nome and new.titular_documento is not distinct from old.titular_documento then
    return new;
  end if;
  raise exception 'O titular da conta se liga pelo cadastro do produtor (Cadastros › Produtores › Contas bancárias).';
end $$;
revoke all on function public._fn_conta_titular_um_dono() from public, anon, authenticated;
create trigger trg_fiscal_conta_titular_um_dono before insert or update of titular_nome, titular_documento
  on public.financeiro_contas_bancarias for each row execute function public._fn_conta_titular_um_dono();

create or replace function public.fn_fiscal_conta_titular_gravar(p_conta_id uuid, p_titular_id uuid, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  c public.financeiro_contas_bancarias; t public.fiscal_titulares; v_nome text; v_doc text; v_conta text;
begin
  select * into c from public.financeiro_contas_bancarias where id = p_conta_id;
  if c.id is null or not coalesce(public.tenant_ok(c.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a esta conta.';
  end if;
  v_conta := coalesce(c.nome_exibicao, c.nome_conta);
  if p_titular_id is not null then
    select * into t from public.fiscal_titulares where id = p_titular_id;
    if t.id is null or t.cliente_id <> c.cliente_id then raise exception 'Titular não encontrado neste cliente.'; end if;
    if not t.ativo then raise exception '%', format('O titular %s está inativo.', t.nome); end if;
    v_nome := t.nome; v_doc := t.documento;
  end if;
  if c.titular_nome is not distinct from v_nome and c.titular_documento is not distinct from v_doc then
    return jsonb_build_object('simulado', p_simular, 'gravado', false, 'conta', v_conta, 'frase', format('%s: nada muda.', v_conta));
  end if;
  if p_simular then
    return jsonb_build_object('simulado', true, 'gravado', false, 'conta', v_conta,
      'antes', jsonb_build_object('titular_nome', c.titular_nome, 'titular_documento', c.titular_documento),
      'depois', jsonb_build_object('titular_nome', v_nome, 'titular_documento', v_doc),
      'frase', case when t.id is null then format('%s fica sem titular.', v_conta)
                    else format('%s passa a ser de %s (%s).', v_conta, t.nome, public._fn_cpf_cnpj_formatado(t.documento)) end);
  end if;
  -- a trilha é a da própria conta (trg_conta_bancaria_auditoria), com o autor logado
  perform set_config('app.fiscal_conta_titular', 'on', true);
  update public.financeiro_contas_bancarias set titular_nome = v_nome, titular_documento = v_doc where id = c.id;
  perform set_config('app.fiscal_conta_titular', '', true);
  return jsonb_build_object('simulado', false, 'gravado', true, 'conta', v_conta,
    'depois', jsonb_build_object('titular_nome', v_nome, 'titular_documento', v_doc));
end $$;

-- ── (9) o acordo de rateio: criar ou editar ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_fiscal_acordo_rateio_gravar(p_cliente_id uuid, p_acordo_id uuid, p_dados jsonb, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  a public.fiscal_acordos_rateio; v_nome text; v_prod uuid; v_terc uuid; v_faz uuid; v_parte numeric; v_doc_em text; v_paga text;
  v_palavras text[]; v_ini date; v_fim date; v_ativo boolean; v_obs text; tp public.fiscal_titulares; tt public.fiscal_titulares;
  v_outro text; v_antes jsonb; v_depois jsonb; v_dif jsonb := '[]'::jsonb; k text; v_id uuid; v_avisos jsonb := '[]'::jsonb;
  v_fora int; v_a_confirmar int := 0; v_raw text; p text;
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este cliente.';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Informe os dados do acordo.'; end if;
  if p_acordo_id is not null then
    select * into a from public.fiscal_acordos_rateio where id = p_acordo_id;
    if a.id is null or a.cliente_id <> p_cliente_id then raise exception 'Acordo não encontrado neste cliente.'; end if;
  end if;

  v_nome := coalesce(public._fn_fiscal_campo_texto(p_dados, 'nome', a.nome), '');
  if v_nome = '' then raise exception 'Dê um nome ao acordo.'; end if;
  foreach k in array array['produtor_id', 'terceiro_id', 'fazenda_id'] loop
    if p_dados ? k and nullif(p_dados->>k, '') is not null
       and p_dados->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception '%', case k when 'fazenda_id' then 'Fazenda não encontrada neste cliente.' else 'Titular não encontrado neste cliente.' end;
    end if;
  end loop;
  v_prod := case when p_dados ? 'produtor_id' then nullif(p_dados->>'produtor_id', '')::uuid else a.produtor_id end;
  v_terc := case when p_dados ? 'terceiro_id' then nullif(p_dados->>'terceiro_id', '')::uuid else a.terceiro_id end;
  v_faz := case when p_dados ? 'fazenda_id' then nullif(p_dados->>'fazenda_id', '')::uuid else a.fazenda_id end;
  if v_prod is null then raise exception 'Escolha o produtor do acordo.'; end if;
  if v_terc is null then raise exception 'Escolha o terceiro (quem divide a despesa).'; end if;
  select * into tp from public.fiscal_titulares where id = v_prod;
  if tp.id is null or tp.cliente_id <> p_cliente_id then raise exception 'Titular não encontrado neste cliente.'; end if;
  if tp.papel <> 'produtor' then raise exception '%', format('%s não é produtor: o acordo é de um produtor com um terceiro.', tp.nome); end if;
  select * into tt from public.fiscal_titulares where id = v_terc;
  if tt.id is null or tt.cliente_id <> p_cliente_id then raise exception 'Titular não encontrado neste cliente.'; end if;
  if tt.papel <> 'terceiro' then raise exception '%', format('%s não está cadastrado como terceiro (parceiro de rateio).', tt.nome); end if;
  if v_faz is not null and not exists (select 1 from public.fazendas f where f.id = v_faz and f.cliente_id = p_cliente_id) then
    raise exception 'Fazenda não encontrada neste cliente.';
  end if;
  if p_dados ? 'parte_produtor' then
    v_raw := nullif(btrim(coalesce(p_dados->>'parte_produtor', '')), '');
    if v_raw is not null and v_raw !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'Parte do produtor: um número de 0 a 100 (vazio = a confirmar).'; end if;
    v_parte := round(v_raw::numeric, 4);
  else
    v_parte := a.parte_produtor;
  end if;
  if v_parte is not null and (v_parte <= 0 or v_parte > 100) then raise exception 'Parte do produtor: de 0 a 100%%.'; end if;
  v_doc_em := coalesce(case when p_dados ? 'documento_em' then nullif(p_dados->>'documento_em', '') end, a.documento_em);
  if coalesce(v_doc_em, '') not in ('produtor', 'terceiro', 'alterna') then
    raise exception 'A nota sai em nome de quem: do produtor, do terceiro, ou alterna.';
  end if;
  v_paga := coalesce(case when p_dados ? 'como_paga' then nullif(p_dados->>'como_paga', '') end, a.como_paga);
  if coalesce(v_paga, '') not in ('transfere_ao_terceiro', 'direto') then
    raise exception 'Como o produtor paga: transfere ao terceiro ou paga direto.';
  end if;
  if p_dados ? 'palavras' then
    if jsonb_typeof(p_dados->'palavras') <> 'array' then raise exception 'Palavras da sugestão: informe uma lista.'; end if;
    v_palavras := '{}';
    for p in select btrim(regexp_replace(x, '\s+', ' ', 'g')) from jsonb_array_elements_text(p_dados->'palavras') x loop
      if p = '' then continue; end if;
      if length(p) < 3 then raise exception '%', format('"%s": a palavra da sugestão tem pelo menos 3 letras.', p); end if;
      if not exists (select 1 from unnest(v_palavras) w where lower(w) = lower(p)) then v_palavras := v_palavras || p; end if;
    end loop;
  else
    v_palavras := coalesce(a.palavras, '{}');
  end if;
  if p_dados ? 'vigencia_inicio' then
    v_raw := nullif(btrim(coalesce(p_dados->>'vigencia_inicio', '')), '');
    if v_raw is null or v_raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Informe o início do acordo (dd/mm/aaaa).'; end if;
    v_ini := v_raw::date;
  else
    v_ini := a.vigencia_inicio;
  end if;
  if v_ini is null then raise exception 'Informe o início do acordo (dd/mm/aaaa).'; end if;
  if p_dados ? 'vigencia_fim' then
    v_raw := nullif(btrim(coalesce(p_dados->>'vigencia_fim', '')), '');
    if v_raw is not null and v_raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Fim do acordo: dd/mm/aaaa.'; end if;
    v_fim := v_raw::date;
  else
    v_fim := a.vigencia_fim;
  end if;
  if v_fim is not null and v_fim < v_ini then raise exception 'O fim do acordo é antes do início.'; end if;
  if p_dados ? 'ativo' then
    if jsonb_typeof(p_dados->'ativo') <> 'boolean' then raise exception 'Ativo: use verdadeiro ou falso.'; end if;
    v_ativo := (p_dados->>'ativo')::boolean;
  else
    v_ativo := coalesce(a.ativo, true);
  end if;
  v_obs := public._fn_fiscal_campo_texto(p_dados, 'observacao', a.observacao);
  if v_ativo and (not tp.ativo or not tt.ativo) then
    raise exception '%', format('%s está inativo.', case when not tp.ativo then tp.nome else tt.nome end);
  end if;

  select x.nome into v_outro from public.fiscal_acordos_rateio x
   where x.cliente_id = p_cliente_id and x.ativo and lower(x.nome) = lower(v_nome) and x.id is distinct from a.id limit 1;
  if v_ativo and v_outro is not null then raise exception '%', format('Já existe o acordo %s.', v_outro); end if;

  if a.id is not null then
    select count(*) into v_fora from public.fiscal_lancamento_acordo la join public.financeiro_lancamentos_v2 l on l.id = la.lancamento_id
     where la.acordo_id = a.id and la.desfeita_em is null
       and (coalesce(l.data_pagamento, l.data_competencia) < v_ini or (v_fim is not null and coalesce(l.data_pagamento, l.data_competencia) > v_fim));
    if v_fora > 0 then
      raise exception '%', format('%s lançamento(s) ligado(s) a %s ficariam fora da vigência: desfaça a ligação antes.', v_fora, v_nome);
    end if;
    if v_prod <> a.produtor_id or v_terc <> a.terceiro_id then
      if exists (select 1 from public.fiscal_lancamento_acordo la where la.acordo_id = a.id and la.desfeita_em is null) then
        raise exception 'O acordo tem lançamentos ligados: o produtor e o terceiro não mudam (crie outro acordo).';
      end if;
    end if;
    if not v_ativo and a.ativo and exists (select 1 from public.fiscal_lancamento_acordo la where la.acordo_id = a.id and la.desfeita_em is null) then
      raise exception 'O acordo tem lançamentos ligados: encerre pela vigência (o fim) em vez de inativar.';
    end if;
    select count(*) into v_a_confirmar from public.fiscal_lancamento_acordo la
     where la.acordo_id = a.id and la.desfeita_em is null and la.percentual is null;
  end if;
  if v_parte is null then
    v_avisos := v_avisos || to_jsonb('Parte do produtor a confirmar: os lançamentos ligados não entram no livro até ela ser preenchida.'::text);
  elsif a.id is not null and a.parte_produtor is null and v_a_confirmar > 0 then
    v_avisos := v_avisos || to_jsonb(format('%s lançamento(s) ligado(s) passam a %s%% e entram no livro.', v_a_confirmar,
                                            replace(trim_scale(v_parte)::text, '.', ',')));
  elsif a.id is not null and a.parte_produtor is distinct from v_parte then
    v_avisos := v_avisos || to_jsonb(format('Os lançamentos já ligados ficam com o %% de quando foram ligados (%s%%).',
                                            replace(trim_scale(a.parte_produtor)::text, '.', ',')));
  end if;
  if v_paga = 'transfere_ao_terceiro' then
    v_avisos := v_avisos || to_jsonb('O pagamento é uma transferência ao terceiro: no livro ele entra como despesa com documento de '
                                     'terceiro — confirmar com o contador.'::text);
  end if;

  v_antes := case when a.id is null then null else jsonb_build_object('nome', a.nome, 'produtor_id', a.produtor_id, 'terceiro_id', a.terceiro_id,
    'fazenda_id', a.fazenda_id, 'parte_produtor', a.parte_produtor, 'documento_em', a.documento_em, 'como_paga', a.como_paga,
    'palavras', to_jsonb(a.palavras), 'vigencia_inicio', a.vigencia_inicio, 'vigencia_fim', a.vigencia_fim, 'ativo', a.ativo,
    'observacao', a.observacao) end;
  v_depois := jsonb_build_object('nome', v_nome, 'produtor_id', v_prod, 'terceiro_id', v_terc, 'fazenda_id', v_faz, 'parte_produtor', v_parte,
    'documento_em', v_doc_em, 'como_paga', v_paga, 'palavras', to_jsonb(v_palavras), 'vigencia_inicio', v_ini, 'vigencia_fim', v_fim,
    'ativo', v_ativo, 'observacao', v_obs);
  foreach k in array array['nome', 'produtor_id', 'terceiro_id', 'fazenda_id', 'parte_produtor', 'documento_em', 'como_paga', 'palavras',
                           'vigencia_inicio', 'vigencia_fim', 'ativo', 'observacao'] loop
    if (v_antes->k) is distinct from (v_depois->k) then
      v_dif := v_dif || jsonb_build_array(jsonb_build_object('campo', k, 'antes', v_antes->k, 'depois', v_depois->k));
    end if;
  end loop;

  if p_simular or jsonb_array_length(v_dif) = 0 then
    return jsonb_build_object('simulado', p_simular, 'gravado', false, 'acordo_id', a.id, 'diferencas', v_dif, 'avisos', v_avisos,
      'frase', case when jsonb_array_length(v_dif) = 0 then format('%s: nada muda.', v_nome)
                    when a.id is null then format('Cria o acordo %s (%s × %s, %s).', v_nome, tp.nome, tt.nome,
                                                  coalesce(replace(trim_scale(v_parte)::text, '.', ',') || '% do produtor', '% a confirmar'))
                    else format('Atualiza o acordo %s.', v_nome) end);
  end if;

  if a.id is null then
    insert into public.fiscal_acordos_rateio (cliente_id, nome, produtor_id, terceiro_id, fazenda_id, parte_produtor, documento_em, como_paga,
                                              palavras, vigencia_inicio, vigencia_fim, ativo, observacao)
    values (p_cliente_id, v_nome, v_prod, v_terc, v_faz, v_parte, v_doc_em, v_paga, v_palavras, v_ini, v_fim, v_ativo, v_obs)
    returning id into v_id;
  else
    update public.fiscal_acordos_rateio set nome = v_nome, produtor_id = v_prod, terceiro_id = v_terc, fazenda_id = v_faz,
           parte_produtor = v_parte, documento_em = v_doc_em, como_paga = v_paga, palavras = v_palavras, vigencia_inicio = v_ini,
           vigencia_fim = v_fim, ativo = v_ativo, observacao = v_obs, updated_at = now()
     where id = a.id;
    v_id := a.id;
    if a.parte_produtor is null and v_parte is not null then
      update public.fiscal_lancamento_acordo set percentual = v_parte
       where acordo_id = a.id and desfeita_em is null and percentual is null;
    end if;
  end if;
  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores,
                                dados_novos, via)
  values (p_cliente_id, v_faz, auth.uid(), 'fiscal', case when a.id is null then 'criou' else 'editou' end, 'fiscal_acordos_rateio', v_id,
    format('Acordo de rateio %s%s', v_nome, case when a.id is null then ' criado' else ' editado' end), v_antes, v_depois,
    public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'acordo_id', v_id, 'diferencas', v_dif, 'avisos', v_avisos);
end $$;

-- ── (9) ligar lançamentos a um acordo (tudo ou nada) ───────────────────────────────────────────────────────────────────────────
create or replace function public.fn_fiscal_lancamentos_acordo_ligar(p_acordo_id uuid, p_lancamentos uuid[], p_como text default 'manual',
                                                                      p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  a public.fiscal_acordos_rateio; v_ids uuid[]; v_n int; v_achados int; v_lista text; v_novos uuid[]; v_ja int; v_soma numeric;
begin
  select * into a from public.fiscal_acordos_rateio where id = p_acordo_id;
  if a.id is null or not coalesce(public.tenant_ok(a.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este acordo.';
  end if;
  if not a.ativo then raise exception '%', format('O acordo %s está inativo.', a.nome); end if;
  if coalesce(p_como, '') not in ('manual', 'pela_sugestao') then raise exception 'Como: manual ou pela sugestão.'; end if;
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_lancamentos, '{}')) x where x is not null;
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then raise exception 'Escolha pelo menos um lançamento.'; end if;
  if v_n > 2000 then raise exception 'No máximo 2.000 lançamentos por vez.'; end if;

  select count(*) into v_achados from public.financeiro_lancamentos_v2 l where l.id = any (v_ids) and l.cliente_id = a.cliente_id;
  if v_achados <> v_n then raise exception '%', format('%s lançamento(s) não são deste cliente.', v_n - v_achados); end if;
  select string_agg(coalesce(l.descricao, '(sem descrição)') || ' de ' || to_char(coalesce(l.data_pagamento, l.data_competencia), 'DD/MM/YYYY'), '; ')
    into v_lista from (select * from public.financeiro_lancamentos_v2 l where l.id = any (v_ids) and l.cancelado limit 5) l;
  if v_lista is not null then raise exception '%', format('Lançamento cancelado não entra em acordo: %s.', v_lista); end if;
  select string_agg(coalesce(l.descricao, '(sem descrição)') || ' de ' || to_char(coalesce(l.data_pagamento, l.data_competencia), 'DD/MM/YYYY'), '; ')
    into v_lista from (select * from public.financeiro_lancamentos_v2 l where l.id = any (v_ids)
                          and (coalesce(l.data_pagamento, l.data_competencia) < a.vigencia_inicio
                               or (a.vigencia_fim is not null and coalesce(l.data_pagamento, l.data_competencia) > a.vigencia_fim)) limit 5) l;
  if v_lista is not null then raise exception '%', format('Fora da vigência do acordo %s: %s.', a.nome, v_lista); end if;
  select string_agg(format('%s (no acordo %s)', coalesce(l.descricao, '(sem descrição)'), o.nome), '; ') into v_lista
    from (select la.lancamento_id, la.acordo_id from public.fiscal_lancamento_acordo la
           where la.lancamento_id = any (v_ids) and la.desfeita_em is null and la.acordo_id <> a.id limit 5) la
    join public.financeiro_lancamentos_v2 l on l.id = la.lancamento_id join public.fiscal_acordos_rateio o on o.id = la.acordo_id;
  if v_lista is not null then raise exception '%', format('Já ligados a outro acordo (desfaça antes): %s.', v_lista); end if;

  select array_agg(x) into v_novos from unnest(v_ids) x
   where not exists (select 1 from public.fiscal_lancamento_acordo la where la.lancamento_id = x and la.desfeita_em is null);
  v_ja := v_n - coalesce(array_length(v_novos, 1), 0);
  select coalesce(sum(l.valor), 0) into v_soma from public.financeiro_lancamentos_v2 l where l.id = any (coalesce(v_novos, '{}'));

  if p_simular or v_novos is null then
    return jsonb_build_object('simulado', p_simular, 'gravado', false, 'acordo', a.nome, 'novos', coalesce(array_length(v_novos, 1), 0),
      'ja_ligados', v_ja, 'soma', v_soma, 'percentual', a.parte_produtor,
      'frase', case when v_novos is null then format('Todos já estão no acordo %s: nada muda.', a.nome)
                    else format('Liga %s lançamento(s) ao acordo %s (%s)%s.', array_length(v_novos, 1), a.nome,
                                coalesce(replace(trim_scale(a.parte_produtor)::text, '.', ',') || '% do produtor', '% a confirmar: não entram no livro até lá'),
                                case when v_ja > 0 then format('; %s já estavam', v_ja) else '' end) end);
  end if;

  insert into public.fiscal_lancamento_acordo (cliente_id, lancamento_id, acordo_id, percentual, como, criado_por)
  select a.cliente_id, x, a.id, a.parte_produtor, p_como, auth.uid() from unnest(v_novos) x;
  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores,
                                dados_novos, via)
  values (a.cliente_id, a.fazenda_id, auth.uid(), 'fiscal', 'ligou', 'fiscal_lancamento_acordo', a.id,
    format('%s lançamento(s) ligado(s) ao acordo %s', array_length(v_novos, 1), a.nome), null,
    jsonb_build_object('lancamentos', to_jsonb(v_novos), 'percentual', a.parte_produtor, 'como', p_como), public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'acordo', a.nome, 'novos', array_length(v_novos, 1), 'ja_ligados', v_ja,
    'soma', v_soma, 'percentual', a.parte_produtor);
end $$;

-- ── (9) desfazer a ligação (um gesto = um motivo) ───────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_fiscal_lancamentos_acordo_desfazer(p_lancamentos uuid[], p_motivo text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_cli uuid; v_ncli int; v_n int; v_motivo text := btrim(coalesce(p_motivo, '')); v_ids uuid[]; v_acordos text;
begin
  select count(distinct la.cliente_id), min(la.cliente_id::text)::uuid, count(*), array_agg(la.id),
         string_agg(distinct o.nome, ', ')
    into v_ncli, v_cli, v_n, v_ids, v_acordos
    from public.fiscal_lancamento_acordo la join public.fiscal_acordos_rateio o on o.id = la.acordo_id
   where la.lancamento_id = any (coalesce(p_lancamentos, '{}')) and la.desfeita_em is null;
  if v_n = 0 then raise exception 'Nenhum destes lançamentos está num acordo.'; end if;
  if v_ncli > 1 or not coalesce(public.tenant_ok(v_cli), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a estes lançamentos.';
  end if;
  if length(v_motivo) < 3 then raise exception 'Diga o motivo (pelo menos 3 letras).'; end if;
  if p_simular then
    return jsonb_build_object('simulado', true, 'gravado', false, 'desfaz', v_n,
      'frase', format('Desfaz %s ligação(ões) (%s).', v_n, v_acordos));
  end if;
  update public.fiscal_lancamento_acordo set desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = v_motivo
   where id = any (v_ids) and desfeita_em is null;
  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (v_cli, auth.uid(), 'fiscal', 'desfez', 'fiscal_lancamento_acordo', v_ids[1],
    format('%s ligação(ões) a acordo desfeita(s) (%s): %s', v_n, v_acordos, v_motivo),
    jsonb_build_object('ligacoes', to_jsonb(v_ids)), jsonb_build_object('motivo', v_motivo), public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'desfaz', v_n);
end $$;

-- ── (9) a sugestão: lançamentos sem acordo cujo texto casa uma palavra de um acordo (leitura; nunca grava) ─────────────────────
create or replace function public.fn_fiscal_acordos_sugeridos(p_cliente_id uuid, p_de date, p_ate date)
returns table (acordo_id uuid, acordo text, lancamento_id uuid, data date, descricao text, fornecedor text, valor numeric,
               status_transacao text, motivo text)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este cliente.';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de then raise exception 'Informe o período (de, até).'; end if;
  if p_ate - p_de > 731 then raise exception 'Período de no máximo 2 anos.'; end if;
  return query
  select a.id, a.nome, l.id, coalesce(l.data_pagamento, l.data_competencia), l.descricao, fo.nome, l.valor, l.status_transacao,
         format('%s contém "%s"', case when public.fn_texto_casa(l.descricao, w.p) then 'a descrição' else 'o fornecedor' end, w.p)
    from public.fiscal_acordos_rateio a
    join public.financeiro_lancamentos_v2 l on l.cliente_id = a.cliente_id and not l.cancelado
     and coalesce(l.data_pagamento, l.data_competencia) between greatest(p_de, a.vigencia_inicio) and least(p_ate, coalesce(a.vigencia_fim, p_ate))
     and (a.fazenda_id is null or l.fazenda_id = a.fazenda_id)
    left join public.financeiro_fornecedores fo on fo.id = l.favorecido_id
    cross join lateral (select x.p from unnest(a.palavras) with ordinality x(p, o)
                         where public.fn_texto_casa(l.descricao, x.p) or public.fn_texto_casa(fo.nome, x.p)
                         order by x.o limit 1) w
   where a.cliente_id = p_cliente_id and a.ativo
     and not exists (select 1 from public.fiscal_lancamento_acordo la where la.lancamento_id = l.id and la.desfeita_em is null)
   order by a.nome, 4, l.id;
end $$;

-- ── a lista da tela (Cadastros › Produtores): a ficha + o que é derivado, numa ida ─────────────────────────────────────────────
create or replace function public.fn_fiscal_titulares_lista(p_cliente_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v jsonb;
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este cliente.';
  end if;
  select coalesce(jsonb_agg(z.ficha || jsonb_build_object('pendencias', to_jsonb(public._fn_fiscal_titular_pendencias(z.ficha)))
                            order by z.ficha->>'papel', lower(z.ficha->>'nome')), '[]'::jsonb)
    into v
    from (select jsonb_build_object(
            'id', t.id, 'nome', t.nome, 'documento', t.documento, 'documento_formatado', public._fn_cpf_cnpj_formatado(t.documento),
            'tipo', t.tipo, 'papel', t.papel, 'cnpj_produtor', t.cnpj_produtor, 'nascimento', t.nascimento, 'email_fiscal', t.email_fiscal,
            'endereco', t.endereco, 'municipio', t.municipio, 'uf', t.uf, 'cep', t.cep, 'regime_ir', t.regime_ir, 'ativo', t.ativo,
            'ies', (select coalesce(jsonb_agg(jsonb_build_object('uf', i.uf, 'ie', i.ie, 'fazenda_id', i.fazenda_id) order by i.uf, i.ie), '[]'::jsonb)
                      from public.fiscal_titular_ies i where i.titular_id = t.id and i.ativo),
            'fazendas', (select coalesce(jsonb_agg(jsonb_build_object('fazenda_id', ft.fazenda_id, 'fazenda', f.nome, 'participacao', ft.participacao,
                                                                      'condicao', ft.condicao, 'registra', ft.registra, 'desde', ft.vigencia_inicio,
                                                                      'ate', ft.vigencia_fim) order by f.nome), '[]'::jsonb)
                           from public.fiscal_fazenda_titulares ft join public.fazendas f on f.id = ft.fazenda_id
                          where ft.titular_id = t.id and ft.substituida_em is null and ft.vigencia_inicio <= v_hoje
                            and (ft.vigencia_fim is null or ft.vigencia_fim >= v_hoje)),
            'condicao_ibs', (select jsonb_build_object('condicao', c.condicao, 'desde', c.vigencia_inicio, 'motivo', c.motivo)
                               from public.fiscal_titular_condicao_ibs c
                              where c.titular_id = t.id and c.substituida_em is null and c.vigencia_inicio <= v_hoje
                                and (c.vigencia_fim is null or c.vigencia_fim >= v_hoje)
                              order by c.vigencia_inicio desc limit 1),
            'grupo', (select coalesce(jsonb_agg(jsonb_build_object('empresa_id', g.empresa_id, 'empresa', y.nome, 'participacao', g.participacao,
                                                                   'atividade', g.atividade, 'entra_no_limite', g.entra_no_limite) order by y.nome), '[]'::jsonb)
                        from public.fiscal_titular_grupo g join public.fiscal_titulares y on y.id = g.empresa_id
                       where g.titular_id = t.id and g.substituida_em is null and g.vigencia_inicio <= v_hoje
                         and (g.vigencia_fim is null or g.vigencia_fim >= v_hoje)),
            'contas', (select coalesce(jsonb_agg(jsonb_build_object('conta_id', b.id, 'conta', coalesce(b.nome_exibicao, b.nome_conta))
                                                 order by coalesce(b.nome_exibicao, b.nome_conta)), '[]'::jsonb)
                         from public.financeiro_contas_bancarias b where b.cliente_id = t.cliente_id and b.titular_documento = t.documento),
            'acordos', (select count(*) from public.fiscal_acordos_rateio a where a.ativo and t.id in (a.produtor_id, a.terceiro_id)),
            'tem_fazenda', exists (select 1 from public.fiscal_fazenda_titulares ft where ft.titular_id = t.id and ft.substituida_em is null
                                      and (ft.vigencia_fim is null or ft.vigencia_fim >= v_hoje)),
            'tem_condicao_ibs', exists (select 1 from public.fiscal_titular_condicao_ibs c where c.titular_id = t.id and c.substituida_em is null
                                           and (c.vigencia_fim is null or c.vigencia_fim >= v_hoje))) ficha
            from public.fiscal_titulares t where t.cliente_id = p_cliente_id) z;
  return v;
end $$;

-- ── os acordos do cliente, com o que está ligado ────────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_fiscal_acordos_lista(p_cliente_id uuid)
returns table (acordo_id uuid, nome text, produtor_id uuid, produtor text, terceiro_id uuid, terceiro text, fazenda_id uuid, fazenda text,
               parte_produtor numeric, documento_em text, como_paga text, palavras text[], vigencia_inicio date, vigencia_fim date,
               ativo boolean, observacao text, ligados int, soma_ligados numeric, a_confirmar int)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este cliente.';
  end if;
  return query
  select a.id, a.nome, a.produtor_id, tp.nome, a.terceiro_id, tt.nome, a.fazenda_id, f.nome, a.parte_produtor, a.documento_em, a.como_paga,
         a.palavras, a.vigencia_inicio, a.vigencia_fim, a.ativo, a.observacao,
         coalesce(s.n, 0)::int, coalesce(s.soma, 0), coalesce(s.a_conf, 0)::int
    from public.fiscal_acordos_rateio a
    join public.fiscal_titulares tp on tp.id = a.produtor_id
    join public.fiscal_titulares tt on tt.id = a.terceiro_id
    left join public.fazendas f on f.id = a.fazenda_id
    left join lateral (select count(*) n, sum(l.valor) soma, count(*) filter (where la.percentual is null) a_conf
                         from public.fiscal_lancamento_acordo la join public.financeiro_lancamentos_v2 l on l.id = la.lancamento_id
                        where la.acordo_id = a.id and la.desfeita_em is null) s on true
   where a.cliente_id = p_cliente_id
   order by not a.ativo, lower(a.nome);
end $$;

-- ── as funções: abertas só para quem está logado (a guarda é o tenant_ok no corpo); as auxiliares, fechadas ──────────────────
revoke all on function public._fn_documento_normalizar(text) from public, anon, authenticated;
revoke all on function public._fn_cpf_cnpj_valido(text) from public, anon, authenticated;
revoke all on function public._fn_fiscal_campo_texto(jsonb, text, text) from public, anon, authenticated;
revoke all on function public._fn_fiscal_titular_pendencias(jsonb) from public, anon, authenticated;
grant execute on function public._fn_documento_normalizar(text) to service_role;
grant execute on function public._fn_cpf_cnpj_valido(text) to service_role;
grant execute on function public._fn_fiscal_campo_texto(jsonb, text, text) to service_role;
grant execute on function public._fn_fiscal_titular_pendencias(jsonb) to service_role;
revoke all on function public.fn_fiscal_titular_gravar(uuid, uuid, jsonb, boolean) from public, anon;
revoke all on function public.fn_fiscal_fazenda_titulares_gravar(uuid, date, jsonb, boolean) from public, anon;
revoke all on function public.fn_fiscal_titular_condicao_ibs_gravar(uuid, date, text, text, boolean) from public, anon;
revoke all on function public.fn_fiscal_titular_grupo_gravar(uuid, date, jsonb, boolean) from public, anon;
revoke all on function public.fn_fiscal_conta_titular_gravar(uuid, uuid, boolean) from public, anon;
revoke all on function public.fn_fiscal_acordo_rateio_gravar(uuid, uuid, jsonb, boolean) from public, anon;
revoke all on function public.fn_fiscal_lancamentos_acordo_ligar(uuid, uuid[], text, boolean) from public, anon;
revoke all on function public.fn_fiscal_lancamentos_acordo_desfazer(uuid[], text, boolean) from public, anon;
revoke all on function public.fn_fiscal_acordos_sugeridos(uuid, date, date) from public, anon;
revoke all on function public.fn_fiscal_titulares_lista(uuid) from public, anon;
revoke all on function public.fn_fiscal_acordos_lista(uuid) from public, anon;
grant execute on function public.fn_fiscal_titular_gravar(uuid, uuid, jsonb, boolean) to authenticated, service_role;
grant execute on function public.fn_fiscal_fazenda_titulares_gravar(uuid, date, jsonb, boolean) to authenticated, service_role;
grant execute on function public.fn_fiscal_titular_condicao_ibs_gravar(uuid, date, text, text, boolean) to authenticated, service_role;
grant execute on function public.fn_fiscal_titular_grupo_gravar(uuid, date, jsonb, boolean) to authenticated, service_role;
grant execute on function public.fn_fiscal_conta_titular_gravar(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.fn_fiscal_acordo_rateio_gravar(uuid, uuid, jsonb, boolean) to authenticated, service_role;
grant execute on function public.fn_fiscal_lancamentos_acordo_ligar(uuid, uuid[], text, boolean) to authenticated, service_role;
grant execute on function public.fn_fiscal_lancamentos_acordo_desfazer(uuid[], text, boolean) to authenticated, service_role;
grant execute on function public.fn_fiscal_acordos_sugeridos(uuid, date, date) to authenticated, service_role;
grant execute on function public.fn_fiscal_titulares_lista(uuid) to authenticated, service_role;
grant execute on function public.fn_fiscal_acordos_lista(uuid) to authenticated, service_role;
