-- FISCAL F-B · 20261028115330 — o CADASTRO que falta para o LCDPR (Chat 12/11 22:15, desenho aprovado; depende da 115320).
--   (1) endereço em partes + município IBGE: titular (0030) e fazenda (0040)
--   (2) CAEPF por produtor × imóvel (0040) — tabela própria (a participação versiona; o CAEPF não)
--   (3) contrapartes do imóvel: arrendador / parceiro / comodante (0045; o condômino deriva das participações)
--   (4) contador do cliente (9999; D4 = por cliente)
--   (5) o banco da conta no catálogo (0050): gravar uma a uma + a SUGESTÃO pelo nome (só leitura; preencher = com OK)
-- Tudo nasce fechado: leitura por tenant_ok; escrita SÓ pelas RPCs (SECURITY DEFINER, tenant_ok → 42501, p_simular = a prévia), trilha
-- no audit_log; nada se apaga (versão nova marca substituida_em). Leitura de perfil "só leitura" barrada pelo _fn_leitura_nao_grava.
set local lock_timeout = '2s';

-- ── (1) endereço em partes ─────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.fiscal_titulares
  add column numero text check (numero is null or btrim(numero) <> ''),
  add column bairro text check (bairro is null or btrim(bairro) <> ''),
  add column cod_municipio_ibge text references public.municipios_ibge (cod_ibge);
alter table public.fazenda_cadastros
  add column endereco text check (endereco is null or btrim(endereco) <> ''),
  add column numero text check (numero is null or btrim(numero) <> ''),
  add column bairro text check (bairro is null or btrim(bairro) <> ''),
  add column cep text check (cep is null or cep ~ '^[0-9]{8}$'),
  add column cod_municipio_ibge text references public.municipios_ibge (cod_ibge);

-- ── (2) CAEPF ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.fiscal_caepf (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  titular_id uuid not null references public.fiscal_titulares (id),
  fazenda_id uuid not null references public.fazendas (id),
  caepf text not null check (caepf ~ '^[0-9]{14}$'),
  criado_em timestamptz not null default now(), criado_por uuid,
  substituida_em timestamptz
);
create unique index fiscal_caepf_vivo_uq on public.fiscal_caepf (titular_id, fazenda_id) where substituida_em is null;
comment on table public.fiscal_caepf is 'FISCAL F-B: CAEPF do produtor no imóvel (0040 do LCDPR). Escrita só por fn_fiscal_caepf_gravar; trocar marca substituida_em.';

-- ── (3) contrapartes ───────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.fiscal_fazenda_contrapartes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  fazenda_id uuid not null references public.fazendas (id),
  titular_id uuid not null references public.fiscal_titulares (id),
  contraparte_id uuid not null references public.fiscal_titulares (id),
  tipo text not null check (tipo in ('arrendador', 'parceiro', 'comodante', 'outros')),
  percentual numeric(7,4) not null check (percentual > 0 and percentual <= 100),
  vigencia_inicio date not null,
  vigencia_fim date check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  motivo text not null check (length(btrim(motivo)) >= 3),
  criado_em timestamptz not null default now(), criado_por uuid,
  substituida_em timestamptz,
  check (contraparte_id <> titular_id)
);
create unique index fiscal_fazenda_contrapartes_uq on public.fiscal_fazenda_contrapartes (titular_id, fazenda_id, contraparte_id, vigencia_inicio)
  where substituida_em is null;
comment on table public.fiscal_fazenda_contrapartes is 'FISCAL F-B: arrendador/parceiro/comodante do produtor no imóvel (0045 do LCDPR). A pessoa é um fiscal_titulares de papel terceiro do MESMO cliente. Escrita só por fn_fiscal_contraparte_gravar.';

-- ── (4) contador ───────────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.fiscal_contador (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  nome text not null check (btrim(nome) <> ''),
  documento text not null check (public._fn_cpf_cnpj_valido(documento)),
  crc text check (crc is null or btrim(crc) <> ''),
  email text check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  fone text check (fone is null or fone ~ '^[0-9]{10,15}$'),
  criado_em timestamptz not null default now(), criado_por uuid,
  substituida_em timestamptz
);
create unique index fiscal_contador_vivo_uq on public.fiscal_contador (cliente_id) where substituida_em is null;
comment on table public.fiscal_contador is 'FISCAL F-B: o contador do cliente (9999 do LCDPR; D4 = por cliente). Escrita só por fn_fiscal_contador_gravar.';

-- ── leitura por tenant; escrita só pelas RPCs ──────────────────────────────────────────────────────────────────────────────
alter table public.fiscal_caepf enable row level security;
alter table public.fiscal_fazenda_contrapartes enable row level security;
alter table public.fiscal_contador enable row level security;
create policy fiscal_caepf_ler on public.fiscal_caepf for select to authenticated using (public.tenant_ok(cliente_id));
create policy fiscal_fazenda_contrapartes_ler on public.fiscal_fazenda_contrapartes for select to authenticated using (public.tenant_ok(cliente_id));
create policy fiscal_contador_ler on public.fiscal_contador for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.fiscal_caepf, public.fiscal_fazenda_contrapartes, public.fiscal_contador from public, anon, authenticated;
grant select on public.fiscal_caepf, public.fiscal_fazenda_contrapartes, public.fiscal_contador to authenticated;
grant all on public.fiscal_caepf, public.fiscal_fazenda_contrapartes, public.fiscal_contador to service_role;
create trigger trg_leitura_nao_grava before insert or delete or update on public.fiscal_caepf
  for each statement execute function public._fn_leitura_nao_grava();
create trigger trg_leitura_nao_grava before insert or delete or update on public.fiscal_fazenda_contrapartes
  for each statement execute function public._fn_leitura_nao_grava();
create trigger trg_leitura_nao_grava before insert or delete or update on public.fiscal_contador
  for each statement execute function public._fn_leitura_nao_grava();

-- ── RPCs ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (1a) endereço do titular em partes
create or replace function public.fn_fiscal_titular_endereco_gravar(p_titular_id uuid, p_numero text, p_bairro text,
  p_cod_municipio_ibge text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  t public.fiscal_titulares; m public.municipios_ibge;
  v_num text := nullif(btrim(coalesce(p_numero, '')), ''); v_bai text := nullif(btrim(coalesce(p_bairro, '')), '');
  v_antes jsonb; v_depois jsonb;
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null or not coalesce(public.tenant_ok(t.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este titular.';
  end if;
  if p_cod_municipio_ibge is not null then
    select * into m from public.municipios_ibge where cod_ibge = p_cod_municipio_ibge;
    if m.cod_ibge is null then raise exception 'Município não encontrado no catálogo do IBGE.'; end if;
    if t.uf is not null and t.uf <> m.uf then
      raise exception '%', format('O município %s é de %s; o titular está em %s.', m.nome, m.uf, t.uf);
    end if;
  end if;
  v_antes := jsonb_build_object('numero', t.numero, 'bairro', t.bairro, 'cod_municipio_ibge', t.cod_municipio_ibge);
  v_depois := jsonb_build_object('numero', v_num, 'bairro', v_bai, 'cod_municipio_ibge', p_cod_municipio_ibge);
  if p_simular or v_antes = v_depois then
    return jsonb_build_object('simulado', p_simular, 'gravado', false, 'titular', t.nome, 'antes', v_antes, 'depois', v_depois,
      'municipio', m.nome, 'nada_muda', v_antes = v_depois);
  end if;
  update public.fiscal_titulares set numero = v_num, bairro = v_bai, cod_municipio_ibge = p_cod_municipio_ibge, updated_at = now()
   where id = t.id;
  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (t.cliente_id, auth.uid(), 'fiscal', 'editou', 'fiscal_titulares', t.id, format('%s · endereço (número, bairro, município)', t.nome),
    v_antes, v_depois, public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'titular', t.nome);
end $$;

-- (1b) endereço fiscal da fazenda (cria a linha do cadastro se ainda não houver)
create or replace function public.fn_fazenda_endereco_fiscal_gravar(p_fazenda_id uuid, p_dados jsonb, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  f record; c public.fazenda_cadastros; m public.municipios_ibge; v_antes jsonb; v_depois jsonb; v_cep text; v_mun text;
begin
  select id, cliente_id, nome into f from public.fazendas where id = p_fazenda_id;
  if f.id is null or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a esta fazenda.';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Informe os dados do endereço.'; end if;
  v_cep := nullif(regexp_replace(coalesce(p_dados->>'cep', ''), '\D', '', 'g'), '');
  if v_cep is not null and v_cep !~ '^[0-9]{8}$' then raise exception 'CEP: 8 dígitos.'; end if;
  v_mun := nullif(btrim(coalesce(p_dados->>'cod_municipio_ibge', '')), '');
  if v_mun is not null then
    select * into m from public.municipios_ibge where cod_ibge = v_mun;
    if m.cod_ibge is null then raise exception 'Município não encontrado no catálogo do IBGE.'; end if;
  end if;
  select * into c from public.fazenda_cadastros where fazenda_id = f.id and cliente_id = f.cliente_id;
  v_antes := jsonb_build_object('endereco', c.endereco, 'numero', c.numero, 'bairro', c.bairro, 'cep', c.cep, 'cod_municipio_ibge', c.cod_municipio_ibge);
  v_depois := jsonb_build_object('endereco', nullif(btrim(coalesce(p_dados->>'endereco', '')), ''),
    'numero', nullif(btrim(coalesce(p_dados->>'numero', '')), ''), 'bairro', nullif(btrim(coalesce(p_dados->>'bairro', '')), ''),
    'cep', v_cep, 'cod_municipio_ibge', v_mun);
  if p_simular or v_antes = v_depois then
    return jsonb_build_object('simulado', p_simular, 'gravado', false, 'fazenda', f.nome, 'antes', v_antes, 'depois', v_depois,
      'municipio', m.nome, 'cria_cadastro', c.id is null, 'nada_muda', v_antes = v_depois);
  end if;
  if c.id is null then
    insert into public.fazenda_cadastros (cliente_id, fazenda_id, endereco, numero, bairro, cep, cod_municipio_ibge)
    values (f.cliente_id, f.id, v_depois->>'endereco', v_depois->>'numero', v_depois->>'bairro', v_cep, v_mun);
  else
    update public.fazenda_cadastros set endereco = v_depois->>'endereco', numero = v_depois->>'numero', bairro = v_depois->>'bairro',
      cep = v_cep, cod_municipio_ibge = v_mun, updated_at = now() where id = c.id;
  end if;
  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (f.cliente_id, f.id, auth.uid(), 'fiscal', 'editou', 'fazenda_cadastros', f.id, format('%s · endereço fiscal', f.nome),
    v_antes, v_depois, public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'fazenda', f.nome);
end $$;

-- (2) CAEPF do produtor no imóvel (nulo = tira; trocar = versão nova)
create or replace function public.fn_fiscal_caepf_gravar(p_titular_id uuid, p_fazenda_id uuid, p_caepf text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  t public.fiscal_titulares; f record; a public.fiscal_caepf; v_novo text := nullif(regexp_replace(coalesce(p_caepf, ''), '\D', '', 'g'), '');
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null or not coalesce(public.tenant_ok(t.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este titular.';
  end if;
  select id, cliente_id, nome into f from public.fazendas where id = p_fazenda_id;
  if f.id is null or f.cliente_id <> t.cliente_id then raise exception 'Fazenda não encontrada neste cliente.'; end if;
  if t.papel <> 'produtor' then raise exception 'O CAEPF é do produtor.'; end if;
  if v_novo is not null and v_novo !~ '^[0-9]{14}$' then raise exception 'CAEPF: 14 dígitos.'; end if;
  select * into a from public.fiscal_caepf where titular_id = t.id and fazenda_id = f.id and substituida_em is null;
  if p_simular or a.caepf is not distinct from v_novo then
    return jsonb_build_object('simulado', p_simular, 'gravado', false, 'titular', t.nome, 'fazenda', f.nome, 'antes', a.caepf,
      'depois', v_novo, 'nada_muda', a.caepf is not distinct from v_novo);
  end if;
  if a.id is not null then update public.fiscal_caepf set substituida_em = now() where id = a.id; end if;
  if v_novo is not null then
    insert into public.fiscal_caepf (cliente_id, titular_id, fazenda_id, caepf, criado_por) values (t.cliente_id, t.id, f.id, v_novo, auth.uid());
  end if;
  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (t.cliente_id, f.id, auth.uid(), 'fiscal', 'editou', 'fiscal_caepf', t.id, format('%s · CAEPF em %s', t.nome, f.nome),
    jsonb_build_object('caepf', a.caepf), jsonb_build_object('caepf', v_novo), public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'titular', t.nome, 'fazenda', f.nome);
end $$;

-- (3) contraparte do imóvel a partir de uma data (mesma data = corrige a versão; antes, a anterior termina na véspera)
create or replace function public.fn_fiscal_contraparte_gravar(p_fazenda_id uuid, p_titular_id uuid, p_contraparte_id uuid, p_tipo text,
  p_percentual numeric, p_inicio date, p_fim date, p_motivo text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  t public.fiscal_titulares; x public.fiscal_titulares; f record; a public.fiscal_fazenda_contrapartes; v_mesma boolean;
  v_motivo text := btrim(coalesce(p_motivo, '')); v_id uuid;
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null or not coalesce(public.tenant_ok(t.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este titular.';
  end if;
  if t.papel <> 'produtor' then raise exception 'A contraparte é do produtor no imóvel.'; end if;
  select * into x from public.fiscal_titulares where id = p_contraparte_id;
  if x.id is null or x.cliente_id <> t.cliente_id then raise exception 'Contraparte não encontrada neste cliente.'; end if;
  if x.papel <> 'terceiro' then raise exception 'A contraparte é um terceiro (arrendador, parceiro ou comodante), não um produtor do cliente.'; end if;
  select id, cliente_id, nome into f from public.fazendas where id = p_fazenda_id;
  if f.id is null or f.cliente_id <> t.cliente_id then raise exception 'Fazenda não encontrada neste cliente.'; end if;
  if coalesce(p_tipo, '') not in ('arrendador', 'parceiro', 'comodante', 'outros') then
    raise exception 'Tipo: arrendador, parceiro, comodante ou outros.';
  end if;
  if p_percentual is null or p_percentual <= 0 or p_percentual > 100 then raise exception 'Percentual entre 0 e 100.'; end if;
  if p_inicio is null then raise exception 'Informe o início da vigência.'; end if;
  if p_fim is not null and p_fim < p_inicio then raise exception 'O fim não pode ser antes do início.'; end if;
  if length(v_motivo) < 3 then raise exception 'Diga o motivo (pelo menos 3 letras).'; end if;
  if exists (select 1 from public.fiscal_fazenda_contrapartes where titular_id = t.id and fazenda_id = f.id and contraparte_id = x.id
              and substituida_em is null and vigencia_inicio > p_inicio) then
    raise exception 'Já existe uma versão mais nova desta contraparte: a nova começa nessa data ou depois.';
  end if;
  select * into a from public.fiscal_fazenda_contrapartes
   where titular_id = t.id and fazenda_id = f.id and contraparte_id = x.id and substituida_em is null and vigencia_inicio <= p_inicio
     and (vigencia_fim is null or vigencia_fim >= p_inicio)
   order by vigencia_inicio desc limit 1;
  v_mesma := a.vigencia_inicio = p_inicio;
  if p_simular then
    return jsonb_build_object('simulado', true, 'gravado', false, 'titular', t.nome, 'fazenda', f.nome, 'contraparte', x.nome,
      'antes', case when a.id is null then null else jsonb_build_object('tipo', a.tipo, 'percentual', a.percentual, 'inicio', a.vigencia_inicio, 'fim', a.vigencia_fim) end,
      'depois', jsonb_build_object('tipo', p_tipo, 'percentual', p_percentual, 'inicio', p_inicio, 'fim', p_fim),
      'corrige_a_versao', coalesce(v_mesma, false), 'anterior_termina', case when a.id is not null and not coalesce(v_mesma, false) then p_inicio - 1 end);
  end if;
  if coalesce(v_mesma, false) then
    update public.fiscal_fazenda_contrapartes set substituida_em = now() where id = a.id;
  elsif a.id is not null then
    update public.fiscal_fazenda_contrapartes set vigencia_fim = p_inicio - 1 where id = a.id;
  end if;
  insert into public.fiscal_fazenda_contrapartes (cliente_id, fazenda_id, titular_id, contraparte_id, tipo, percentual, vigencia_inicio, vigencia_fim, motivo, criado_por)
  values (t.cliente_id, f.id, t.id, x.id, p_tipo, p_percentual, p_inicio, p_fim, v_motivo, auth.uid()) returning id into v_id;
  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (t.cliente_id, f.id, auth.uid(), 'fiscal', 'editou', 'fiscal_fazenda_contrapartes', v_id,
    format('%s · %s %s em %s a partir de %s', t.nome, p_tipo, x.nome, f.nome, to_char(p_inicio, 'DD/MM/YYYY')),
    case when a.id is null then null else to_jsonb(a) end,
    jsonb_build_object('tipo', p_tipo, 'percentual', p_percentual, 'inicio', p_inicio, 'fim', p_fim, 'motivo', v_motivo), public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'id', v_id);
end $$;

-- (4) contador do cliente (versão nova marca a anterior)
create or replace function public.fn_fiscal_contador_gravar(p_cliente_id uuid, p_dados jsonb, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  a public.fiscal_contador; v_doc text; v_fone text; v_depois jsonb;
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este cliente.';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Informe os dados do contador.'; end if;
  v_doc := regexp_replace(coalesce(p_dados->>'documento', ''), '\D', '', 'g');
  if btrim(coalesce(p_dados->>'nome', '')) = '' then raise exception 'Informe o nome do contador.'; end if;
  if not public._fn_cpf_cnpj_valido(v_doc) then raise exception 'CPF/CNPJ do contador inválido.'; end if;
  v_fone := nullif(regexp_replace(coalesce(p_dados->>'fone', ''), '\D', '', 'g'), '');
  v_depois := jsonb_build_object('nome', btrim(p_dados->>'nome'), 'documento', v_doc, 'crc', nullif(btrim(coalesce(p_dados->>'crc', '')), ''),
    'email', nullif(btrim(coalesce(p_dados->>'email', '')), ''), 'fone', v_fone);
  select * into a from public.fiscal_contador where cliente_id = p_cliente_id and substituida_em is null;
  if p_simular then
    return jsonb_build_object('simulado', true, 'gravado', false,
      'antes', case when a.id is null then null else jsonb_build_object('nome', a.nome, 'documento', a.documento, 'crc', a.crc, 'email', a.email, 'fone', a.fone) end,
      'depois', v_depois);
  end if;
  if a.id is not null then update public.fiscal_contador set substituida_em = now() where id = a.id; end if;
  insert into public.fiscal_contador (cliente_id, nome, documento, crc, email, fone, criado_por)
  values (p_cliente_id, v_depois->>'nome', v_doc, v_depois->>'crc', v_depois->>'email', v_fone, auth.uid());
  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (p_cliente_id, auth.uid(), 'fiscal', 'editou', 'fiscal_contador', p_cliente_id, 'contador do cliente',
    case when a.id is null then null else to_jsonb(a) end, v_depois, public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true);
end $$;

-- (5a) o banco da conta no catálogo (uma conta; nulo = tira)
create or replace function public.fn_conta_banco_referencia_gravar(p_conta_id uuid, p_banco_referencia_id uuid, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  c public.financeiro_contas_bancarias; b public.bancos_referencia; a public.bancos_referencia;
begin
  select * into c from public.financeiro_contas_bancarias where id = p_conta_id;
  if c.id is null or not coalesce(public.tenant_ok(c.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a esta conta.';
  end if;
  if p_banco_referencia_id is not null then
    select * into b from public.bancos_referencia where id = p_banco_referencia_id;
    if b.id is null then raise exception 'Banco não encontrado no catálogo.'; end if;
  end if;
  select * into a from public.bancos_referencia where id = c.banco_referencia_id;
  if p_simular or c.banco_referencia_id is not distinct from p_banco_referencia_id then
    return jsonb_build_object('simulado', p_simular, 'gravado', false, 'conta', coalesce(c.nome_exibicao, c.nome_conta), 'banco_texto', c.banco,
      'antes', case when a.id is null then null else jsonb_build_object('codigo', a.codigo_banco, 'nome', a.nome_banco) end,
      'depois', case when b.id is null then null else jsonb_build_object('codigo', b.codigo_banco, 'nome', b.nome_banco, 'eh_banco', b.eh_banco) end,
      'nada_muda', c.banco_referencia_id is not distinct from p_banco_referencia_id);
  end if;
  update public.financeiro_contas_bancarias set banco_referencia_id = p_banco_referencia_id, updated_at = now(), updated_by = auth.uid()
   where id = c.id;
  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (c.cliente_id, c.fazenda_id, auth.uid(), 'financeiro', 'editou', 'financeiro_contas_bancarias', c.id,
    format('%s · banco no catálogo', coalesce(c.nome_exibicao, c.nome_conta)),
    jsonb_build_object('banco_referencia_id', c.banco_referencia_id), jsonb_build_object('banco_referencia_id', p_banco_referencia_id),
    public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true);
end $$;

-- (5b) a SUGESTÃO pelo nome em texto (só leitura): o que casa 1 a 1, o que tem mais de um candidato e o que não casa
create or replace function public.fn_contas_banco_referencia_sugeridas(p_cliente_id uuid)
returns table (conta_id uuid, conta text, banco_texto text, banco_referencia_id uuid, codigo text, nome text, situacao text)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este cliente.';
  end if;
  return query
  with cand as (
    select c.id, coalesce(c.nome_exibicao, c.nome_conta) conta, c.banco, b.id bid, b.codigo_banco, b.nome_banco,
           count(b.id) over (partition by c.id) n
      from public.financeiro_contas_bancarias c
      left join public.bancos_referencia b on b.ativo
           and (lower(b.nome_banco) = lower(btrim(c.banco)) or lower(b.nome_curto) = lower(btrim(c.banco)))
     where c.cliente_id = p_cliente_id and c.ativa and c.banco_referencia_id is null)
  select cand.id, cand.conta, cand.banco, case when cand.n = 1 then cand.bid end, cand.codigo_banco, cand.nome_banco,
         case when cand.n = 0 then 'nao_casa' when cand.n = 1 then 'casa' else 'varios' end
    from cand order by 2, 6;
end $$;

revoke all on function public.fn_fiscal_titular_endereco_gravar(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.fn_fazenda_endereco_fiscal_gravar(uuid, jsonb, boolean) from public, anon;
revoke all on function public.fn_fiscal_caepf_gravar(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.fn_fiscal_contraparte_gravar(uuid, uuid, uuid, text, numeric, date, date, text, boolean) from public, anon;
revoke all on function public.fn_fiscal_contador_gravar(uuid, jsonb, boolean) from public, anon;
revoke all on function public.fn_conta_banco_referencia_gravar(uuid, uuid, boolean) from public, anon;
revoke all on function public.fn_contas_banco_referencia_sugeridas(uuid) from public, anon;
grant execute on function public.fn_fiscal_titular_endereco_gravar(uuid, text, text, text, boolean) to authenticated, service_role;
grant execute on function public.fn_fazenda_endereco_fiscal_gravar(uuid, jsonb, boolean) to authenticated, service_role;
grant execute on function public.fn_fiscal_caepf_gravar(uuid, uuid, text, boolean) to authenticated, service_role;
grant execute on function public.fn_fiscal_contraparte_gravar(uuid, uuid, uuid, text, numeric, date, date, text, boolean) to authenticated, service_role;
grant execute on function public.fn_fiscal_contador_gravar(uuid, jsonb, boolean) to authenticated, service_role;
grant execute on function public.fn_conta_banco_referencia_gravar(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.fn_contas_banco_referencia_sugeridas(uuid) to authenticated, service_role;
