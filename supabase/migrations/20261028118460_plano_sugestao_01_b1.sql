-- PLANO-SUGESTAO-01 B1 (Gabriel 23/11/2026: D2 sim, D3–D7 como recomendado; D1 14:15 "o Kit Bisão é PULVERIZADOR — 8424 → Implementos da
-- atividade, nunca Rede Elétrica") — A CONTA SUGERIDA POR ITEM DA NOTA, com fonte e confiança. Parte do BANCO; a tela (sub-aba "Contas" dos
-- Itens da nota) é do Code 2.
-- O QUE FAZ:
--   1. produto_ncm_familia (global): prefixo do NCM (2–8 dígitos, o mais longo vence) → família. produto_familia_conta (global): família ×
--      atividade (escopo_negocio) → conta do PLANO PADRÃO (ativa, '2-Saídas', da mesma atividade: gatilho). Escrita só pelo admin, por função,
--      com trilha (produto_classificacao_trilha, só acrescenta). Semente curta (D4, abaixo).
--   2. fn_nota_itens_sugerir_conta(nota): SÓ LÊ. Por item, para no 1º degrau que responde:
--      a0 regra do operador (financeiro_classificacao_regras origem 'item_da_nota': CNPJ do emitente + código, sem código a descrição
--         normalizada) → alta;
--      a  uso NESTE cliente em OUTRAS notas (a nota em análise nunca é fonte de si): CNPJ + código; sem código igual, a descrição normalizada
--         (qualquer emitente) → alta com ≥ 2 notas e uma conta só; senão média (a mais usada);
--      a′ o resto da MESMA nota: ≥ 2 itens resolvidos em a0/a e ≥ 80% deles na mesma conta → os sem resposta a seguem → média (D2);
--      b  OUTROS clientes: mesmo produto → só conta do PADRÃO, com ≥ 2 outros clientes concordando; nada do outro cliente sai (D5) → média;
--      c  NCM → família × atividade: a fazenda pela IE do destinatário; a atividade = a de ≥ 80% dos lançamentos dela em 24 meses → média;
--         fazenda não achada (atividade do cliente) ou mista → baixa;
--      sem resposta → 'sem_sugestao' + pede_ia (a IA é a fatia B3).
--      Sempre: conta ATIVA do plano do cliente e do TIPO da nota (o cliente emitente = venda '1-Entradas'; senão compra '2-Saídas').
--   3. A correção do operador vira regra: fn_item_regra_gravar / fn_item_regra_desfazer (prévia por padrão; trilha; desfazer = ativo false;
--      uma regra ativa por cliente + emitente + produto; NUNCA reclassifica o que já foi lançado).
--   4. D6: fn_classificacao_resolver_contexto (importadores, casa por substring) passa a ignorar as regras 'item_da_nota' (patch por md5).
-- NÃO FAZ: não grava lançamento nem parte, não muda dado de cliente, não chama IA, não muda as 3 regras de hoje.
-- DESFAZER: drop das 3 tabelas e das 7 funções novas + do índice; replace inverso no resolver (tirar a linha "PLANO-SUGESTAO-01 D6").

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- ── 1. tabelas globais + trilha ───────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.produto_ncm_familia (
  prefixo text primary key constraint produto_ncm_familia_prefixo_ck check (prefixo ~ '^[0-9]{2,8}$'),
  familia text not null constraint produto_ncm_familia_familia_ck check (familia ~ '^[a-z][a-z_]{2,39}$'),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
comment on table public.produto_ncm_familia is
  'PLANO-SUGESTAO-01: prefixo do NCM (2–8 dígitos; o mais longo vence) → família do produto. Global; escrita só pelo admin (fn_produto_ncm_familia_gravar), com trilha.';

create table public.produto_familia_conta (
  familia text not null constraint produto_familia_conta_familia_ck check (familia ~ '^[a-z][a-z_]{2,39}$'),
  escopo_negocio text not null constraint produto_familia_conta_escopo_ck check (escopo_negocio in ('agricultura', 'pecuaria', 'silvicultura', 'administrativo')),
  plano_conta_id uuid not null references public.financeiro_plano_contas(id),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (familia, escopo_negocio)
);
comment on table public.produto_familia_conta is
  'PLANO-SUGESTAO-01: família × atividade → conta do PLANO PADRÃO (ativa, 2-Saídas, da mesma atividade — gatilho). Global; escrita só pelo admin (fn_produto_familia_conta_gravar), com trilha.';

create table public.produto_classificacao_trilha (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  via text,
  objeto text not null constraint produto_classificacao_trilha_objeto_ck check (objeto in ('ncm_familia', 'familia_conta', 'regra_item')),
  chave text not null,
  cliente_id uuid,
  acao text not null constraint produto_classificacao_trilha_acao_ck check (acao in ('criar', 'alterar', 'desativar', 'reativar')),
  antes jsonb,
  depois jsonb,
  motivo text not null constraint produto_classificacao_trilha_motivo_ck check (length(btrim(motivo)) >= 3)
);
comment on table public.produto_classificacao_trilha is
  'PLANO-SUGESTAO-01: trilha (só acrescenta) das tabelas de NCM/família e das regras de item da nota (financeiro_classificacao_regras origem item_da_nota).';
create index produto_classificacao_trilha_chave_idx on public.produto_classificacao_trilha (objeto, chave, criado_em desc);

create function public._fn_produto_trilha_imutavel() returns trigger language plpgsql set search_path = public, pg_temp as $f$
begin
  raise exception 'A trilha da classificação por produto não se altera nem se apaga.' using errcode = '42501';
end $f$;
create trigger trg_produto_trilha_imutavel before update or delete on public.produto_classificacao_trilha
  for each row execute function public._fn_produto_trilha_imutavel();

create function public._fn_produto_familia_conta_guarda() returns trigger language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  if not exists (select 1 from public.financeiro_plano_contas pc
                  where pc.id = new.plano_conta_id and pc.cliente_id is null and pc.ativo
                    and pc.tipo_operacao = '2-Saídas' and pc.escopo_negocio = new.escopo_negocio) then
    raise exception using errcode = '23514',
      message = 'A conta da família precisa ser do plano padrão, ativa, de saída e da mesma atividade.', detail = new.plano_conta_id::text;
  end if;
  return new;
end $f$;
create trigger trg_produto_familia_conta_guarda before insert or update on public.produto_familia_conta
  for each row execute function public._fn_produto_familia_conta_guarda();

alter table public.produto_ncm_familia enable row level security;
alter table public.produto_familia_conta enable row level security;
alter table public.produto_classificacao_trilha enable row level security;
create policy produto_ncm_familia_select on public.produto_ncm_familia for select to authenticated using (true);
create policy produto_familia_conta_select on public.produto_familia_conta for select to authenticated using (true);
create policy produto_classificacao_trilha_select on public.produto_classificacao_trilha for select to authenticated
  using (case when cliente_id is null then public.is_admin_agroinblue((select auth.uid())) else public.tenant_ok(cliente_id) end);
revoke all on table public.produto_ncm_familia, public.produto_familia_conta, public.produto_classificacao_trilha from public, anon, authenticated;
grant select on table public.produto_ncm_familia, public.produto_familia_conta, public.produto_classificacao_trilha to authenticated;

-- uma regra de item ATIVA por cliente + emitente + produto (e o índice da leitura)
create unique index financeiro_classificacao_regras_item_da_nota_uq on public.financeiro_classificacao_regras (cliente_id, cond_fornecedor, cond_produto)
  where origem = 'item_da_nota' and ativo;

-- ── 2. semente (D4 + D1; contas achadas pelo nome no PLANO PADRÃO — nome que não casa 1 vez recusa tudo) ─────────────────────────────
do $semente$
declare
  r record; v_id uuid; v_n int;
begin
  insert into public.produto_ncm_familia (prefixo, familia)
  select p, f from (values
    ('3808', 'defensivo'),
    ('02', 'alimento'), ('03', 'alimento'), ('04', 'alimento'), ('07', 'alimento'), ('08', 'alimento'), ('09', 'alimento'), ('1006', 'alimento'),
    ('11', 'alimento'), ('15', 'alimento'), ('16', 'alimento'), ('17', 'alimento'), ('18', 'alimento'), ('19', 'alimento'), ('20', 'alimento'),
    ('21', 'alimento'), ('22', 'alimento'),
    ('220710', 'combustivel'), ('271012', 'combustivel'), ('27101921', 'combustivel'),
    ('23', 'nutricao_animal'),
    ('1209', 'semente'),
    ('3101', 'fertilizante'), ('3102', 'fertilizante'), ('3103', 'fertilizante'), ('3104', 'fertilizante'), ('3105', 'fertilizante'),
    ('3002', 'sanidade_animal'), ('3004', 'sanidade_animal'),
    ('2521', 'corretivo'), ('2522', 'corretivo'),
    ('842441', 'pulverizador'), ('842449', 'pulverizador')
  ) x(p, f);

  for r in select * from (values
    ('defensivo', 'agricultura', 'Defensivos Agrícolas Agricultura'), ('defensivo', 'pecuaria', 'Vacinas e Vermífugos'),
    ('defensivo', 'silvicultura', 'Defensivos e Formicidas Silvicultura'),
    ('alimento', 'agricultura', 'Alimentação e Cantina Agricultura'), ('alimento', 'pecuaria', 'Alimentação e Cantina Pecuária'),
    ('alimento', 'silvicultura', 'Alimentação e Cantina Silvicultura'), ('alimento', 'administrativo', 'Alimentação e Cantina Administrativo'),
    ('combustivel', 'agricultura', 'Combustível Máquinas Agricultura'), ('combustivel', 'pecuaria', 'Combustível Máquinas Pecuária'),
    ('combustivel', 'silvicultura', 'Combustível Máquinas Silvicultura'), ('combustivel', 'administrativo', 'Combustível Veículos Administrativo'),
    ('nutricao_animal', 'pecuaria', 'Nutrição'),
    ('semente', 'agricultura', 'Sementes Agricultura'),
    ('fertilizante', 'agricultura', 'Fertilizantes Agricultura'), ('fertilizante', 'silvicultura', 'Fertilizantes Silvicultura'),
    ('sanidade_animal', 'pecuaria', 'Vacinas e Vermífugos'),
    ('corretivo', 'agricultura', 'Corretivos de Solo'), ('corretivo', 'pecuaria', 'Investimento em Correção de Solo Pecuária'),
    ('corretivo', 'silvicultura', 'Investimento em Correção de Solo Silvicultura'),
    ('pulverizador', 'agricultura', 'Investimento em Implementos Agricultura'), ('pulverizador', 'pecuaria', 'Investimento em Implementos Pecuária'),
    ('pulverizador', 'silvicultura', 'Investimento em Implementos Silvicultura')
  ) x(familia, escopo, subcentro) loop
    select count(*), min(pc.id::text)::uuid into v_n, v_id from public.financeiro_plano_contas pc
     where pc.cliente_id is null and pc.ativo and pc.tipo_operacao = '2-Saídas' and pc.subcentro = r.subcentro;
    if v_n <> 1 then raise exception 'PLANO-SUGESTAO-01: a conta "%" casa % vez(es) no plano padrão. Nada foi gravado.', r.subcentro, v_n; end if;
    insert into public.produto_familia_conta (familia, escopo_negocio, plano_conta_id) values (r.familia, r.escopo, v_id);
  end loop;

  insert into public.produto_classificacao_trilha (criado_por, via, objeto, chave, acao, depois, motivo)
  select null, 'sistema:migração', 'ncm_familia', f.prefixo, 'criar', to_jsonb(f), 'Semente PLANO-SUGESTAO-01 (Gabriel 23/11/2026)' from public.produto_ncm_familia f;
  insert into public.produto_classificacao_trilha (criado_por, via, objeto, chave, acao, depois, motivo)
  select null, 'sistema:migração', 'familia_conta', c.familia || '/' || c.escopo_negocio, 'criar', to_jsonb(c), 'Semente PLANO-SUGESTAO-01 (Gabriel 23/11/2026)'
    from public.produto_familia_conta c;
end $semente$;

-- ── 3. ajudantes ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- o tipo da nota para o cliente: o cliente emitente (produtor cadastrado) = venda; senão compra
create function public._fn_nota_tipo_operacao(p_cliente uuid, p_emitente text) returns text
language sql stable security definer set search_path = public, pg_temp as $f$
  select case when exists (select 1 from public.fiscal_titulares t
                            where t.cliente_id = p_cliente and t.papel = 'produtor' and public._fn_documento_normalizar(p_emitente) <> ''
                              and public._fn_documento_normalizar(p_emitente) in (public._fn_documento_normalizar(t.documento), public._fn_documento_normalizar(t.cnpj_produtor)))
              then '1-Entradas' else '2-Saídas' end
$f$;

-- a chave do produto dentro do emitente: o código; sem código, a descrição normalizada (D3)
create function public._fn_produto_chave(p_codigo text, p_descricao text) returns text
language sql stable set search_path = public, pg_temp as $f$
  select coalesce(nullif(btrim(p_codigo), ''), public._fn_normalizar_texto(p_descricao))
$f$;

-- ── 4. a sugestão (só lê) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
create function public.fn_nota_itens_sugerir_conta(p_nota_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp set plan_cache_mode = force_custom_plan as $f$
declare
  n public.nota_fiscal%rowtype;
  v_tipo text; v_faz uuid; v_faz_n int; v_escopo text; v_parte numeric; v_escopo_fonte text; v_desde date; v_itens jsonb;
begin
  select * into n from public.nota_fiscal where id = p_nota_id;
  if n.id is null or not coalesce(public.tenant_ok(n.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a esta nota.', detail = coalesce(p_nota_id::text, '');
  end if;
  v_tipo := public._fn_nota_tipo_operacao(n.cliente_id, n.emitente_documento);
  v_desde := coalesce(n.emissao, current_date) - 730;

  -- a fazenda pela IE do destinatário (só os dígitos; uma fazenda só, senão nenhuma)
  select min(fc.fazenda_id::text)::uuid, count(distinct fc.fazenda_id) into v_faz, v_faz_n
    from public.fazenda_cadastros fc
   where fc.cliente_id = n.cliente_id
     and nullif(regexp_replace(coalesce(fc.ie, ''), '\D', '', 'g'), '') = nullif(regexp_replace(coalesce(n.dest_ie, ''), '\D', '', 'g'), '');
  if v_faz_n <> 1 then v_faz := null; end if;

  -- a atividade: administrativa = administrativo; senão a mais frequente nos lançamentos (da fazenda; sem fazenda, do cliente) em 24 meses
  if v_faz is not null and exists (select 1 from public.fazendas f where f.id = v_faz and f.eh_administrativa) then
    v_escopo := 'administrativo'; v_parte := 1; v_escopo_fonte := 'fazenda';
  else
    select x.e, x.parte into v_escopo, v_parte from (
      select l.escopo_negocio e, count(*)::numeric / sum(count(*)) over () parte
        from public.financeiro_lancamentos_v2 l
       where l.cliente_id = n.cliente_id and (v_faz is null or l.fazenda_id = v_faz)
         and l.cancelado is not true and l.cenario = 'realizado'
         and l.escopo_negocio in ('agricultura', 'pecuaria', 'silvicultura')
         and coalesce(l.data_competencia, l.data_pagamento) >= v_desde
       group by 1) x
     order by x.parte desc, x.e limit 1;
    v_escopo_fonte := case when v_escopo is null then null when v_faz is null then 'cliente' else 'fazenda' end;
  end if;

  with it as (
    select i.id, i.n_item, nullif(btrim(i.codigo), '') cod, public._fn_normalizar_texto(i.descricao) dnorm,
           public._fn_produto_chave(i.codigo, i.descricao) chave, regexp_replace(coalesce(i.ncm, ''), '\D', '', 'g') ncm
      from public.nota_fiscal_itens i where i.nota_id = n.id
  ),
  valida as (
    select pc.id, pc.cliente_id from public.financeiro_plano_contas pc
     where pc.ativo and pc.tipo_operacao = v_tipo and (pc.cliente_id is null or pc.cliente_id = n.cliente_id)
  ),
  a0 as (
    select distinct on (it.id) it.id item_id, r.plano_conta_id plano
      from it join public.financeiro_classificacao_regras r
        on r.cliente_id = n.cliente_id and r.ativo and r.origem = 'item_da_nota'
       and r.cond_fornecedor = n.emitente_documento and r.cond_produto = it.chave
      join valida v on v.id = r.plano_conta_id
     order by it.id, r.updated_at desc, r.created_at desc
  ),
  hist as (   -- itens de OUTRAS notas com a conta do lançamento (conta única) ou da parte que leva o item
    select hn.cliente_id, hn.id nota_id, hn.emitente_documento cnpj, nullif(btrim(hi.codigo), '') cod,
           public._fn_normalizar_texto(hi.descricao) dnorm, hn.emissao, coalesce(pp.plano_conta_id, l.plano_conta_id) plano
      from public.nota_fiscal hn
      join public.nota_fiscal_itens hi on hi.nota_id = hn.id
      join public.financeiro_lancamento_documentos d on d.cliente_id = hn.cliente_id and d.cancelado is not true
       and ((hn.chave_acesso is not null and d.chave_acesso = hn.chave_acesso)
            or (hn.modelo = 'nfse_municipal' and public._fn_nota_casa_documento(hn, d)))
      join public.financeiro_lancamentos_v2 l on l.id = d.lancamento_id and l.cancelado is not true and l.cenario = 'realizado'
      left join public.financeiro_lancamento_partes pp on pp.lancamento_id = l.id and pp.nota_itens @> to_jsonb(hi.n_item)
     where hn.id <> n.id
       and (pp.id is not null or not exists (select 1 from public.financeiro_lancamento_partes p2 where p2.lancamento_id = l.id))
       and (nullif(btrim(hi.codigo), '') in (select cod from it) or public._fn_normalizar_texto(hi.descricao) in (select dnorm from it))
  ),
  hist_ok as (select h.*, v.cliente_id plano_cliente from hist h join valida v on v.id = h.plano),
  a_cod as (
    select it.id item_id, h.plano, count(distinct h.nota_id) usos, max(h.emissao) ultima
      from it join hist_ok h on h.cliente_id = n.cliente_id and it.cod is not null and h.cod = it.cod and h.cnpj = n.emitente_documento
     group by 1, 2
  ),
  a_desc as (
    select it.id item_id, h.plano, count(distinct h.nota_id) usos, max(h.emissao) ultima
      from it join hist_ok h on h.cliente_id = n.cliente_id and it.dnorm is not null and h.dnorm = it.dnorm
     where not exists (select 1 from a_cod c where c.item_id = it.id)
     group by 1, 2
  ),
  a_cand as (select *, 'codigo'::text via from a_cod union all select *, 'descricao'::text from a_desc),
  a as (
    select distinct on (item_id) item_id, plano, usos, via, count(*) over (partition by item_id) contas
      from a_cand order by item_id, usos desc, ultima desc nulls last, plano
  ),
  resolvidos as (
    select item_id, plano from a0
    union all select a.item_id, a.plano from a where not exists (select 1 from a0 where a0.item_id = a.item_id)
  ),
  maioria as (
    select plano, count(*) n_conta, (select count(*) from resolvidos) n_tot from resolvidos group by plano order by count(*) desc, plano limit 1
  ),
  b_cand as (
    select it.id item_id, h.plano, count(distinct h.cliente_id) clientes
      from it join hist_ok h on h.cliente_id <> n.cliente_id and h.plano_cliente is null
       and ((it.cod is not null and h.cod = it.cod and h.cnpj = n.emitente_documento) or (it.dnorm is not null and h.dnorm = it.dnorm))
     group by 1, 2 having count(distinct h.cliente_id) >= 2
  ),
  b as (select distinct on (item_id) item_id, plano from b_cand order by item_id, clientes desc, plano),
  fam as (
    select distinct on (it.id) it.id item_id, f.familia
      from it join public.produto_ncm_familia f on f.ativo and it.ncm like f.prefixo || '%'
     order by it.id, length(f.prefixo) desc
  ),
  c as (
    select fam.item_id, fam.familia, fc.plano_conta_id plano
      from fam join public.produto_familia_conta fc on fc.ativo and fc.familia = fam.familia and fc.escopo_negocio = v_escopo
      join valida v on v.id = fc.plano_conta_id
  ),
  res as (
    select it.id, it.n_item,
           case when a0.item_id is not null then 'a0' when a.item_id is not null then 'a' when m.plano is not null then 'a_nota'
                when b.item_id is not null then 'b' when c.item_id is not null then 'c' end fonte,
           coalesce(a0.plano, a.plano, m.plano, b.plano, c.plano) plano, a.usos, a.contas, a.via, c.familia
      from it
      left join a0 on a0.item_id = it.id
      left join a on a.item_id = it.id
      left join maioria m on a0.item_id is null and a.item_id is null and m.n_tot >= 2 and m.n_conta::numeric / m.n_tot >= 0.8
      left join b on b.item_id = it.id
      left join c on c.item_id = it.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', r.id, 'n_item', r.n_item, 'plano_conta_id', r.plano, 'subcentro', pc.subcentro,
           'fonte', coalesce(r.fonte, 'sem_sugestao'),
           'confianca', case r.fonte when 'a0' then 'alta'
                          when 'a' then case when r.contas = 1 and r.usos >= 2 then 'alta' else 'media' end
                          when 'a_nota' then 'media' when 'b' then 'media'
                          when 'c' then case when v_escopo_fonte = 'fazenda' and v_parte >= 0.8 then 'media' else 'baixa' end end,
           'porque', case r.fonte
                       when 'a0' then 'Regra sua: este produto deste fornecedor vai para esta conta.'
                       when 'a' then 'Já usado ' || r.usos || '× neste cliente' || case when r.via = 'descricao' then ' (pela descrição)' else '' end
                                     || case when r.contas > 1 then '; já foi para outras contas — confira.' else '.' end
                       when 'a_nota' then 'O resto desta nota está nesta conta.'
                       when 'b' then 'Usado assim em outros clientes.'
                       when 'c' then 'Pelo NCM (' || replace(r.familia, '_', ' ') || ') e a atividade '
                                     || case when v_escopo_fonte = 'fazenda' then 'da fazenda' else 'do cliente — confira' end || '.'
                       else 'Sem sugestão: escolha a conta.' end,
           'pede_ia', r.fonte is null
         ) order by r.n_item), '[]'::jsonb)
    into v_itens
    from res r left join public.financeiro_plano_contas pc on pc.id = r.plano;

  return jsonb_build_object('ok', true, 'nota_id', n.id, 'tipo_operacao', v_tipo, 'fazenda_id', v_faz, 'escopo', v_escopo,
                            'escopo_fonte', v_escopo_fonte, 'itens', v_itens);
end $f$;
comment on function public.fn_nota_itens_sugerir_conta(uuid) is
  'PLANO-SUGESTAO-01: a conta sugerida por item da nota (a0 regra · a uso no cliente · a_nota o resto da nota · b outros clientes, só padrão · c NCM × atividade), com fonte, confiança e porquê. Só lê.';

-- ── 5. a correção do operador vira regra (prévia por padrão) ──────────────────────────────────────────────────────────────────────────
create function public.fn_item_regra_gravar(p_item_id uuid, p_plano_conta_id uuid, p_motivo text, p_simular boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare
  i public.nota_fiscal_itens%rowtype; n public.nota_fiscal%rowtype; r public.financeiro_classificacao_regras%rowtype;
  v_tipo text; v_chave text; v_sub text; v_sub_antes text; v_acao text; v_id uuid;
begin
  select * into i from public.nota_fiscal_itens where id = p_item_id;
  select * into n from public.nota_fiscal where id = i.nota_id;
  if n.id is null or not coalesce(public.tenant_ok(n.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a esta nota.', detail = coalesce(p_item_id::text, '');
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception using errcode = '22023', message = 'Diga o motivo da regra.'; end if;
  v_tipo := public._fn_nota_tipo_operacao(n.cliente_id, n.emitente_documento);
  select pc.subcentro into v_sub from public.financeiro_plano_contas pc
   where pc.id = p_plano_conta_id and pc.ativo and pc.tipo_operacao = v_tipo and (pc.cliente_id is null or pc.cliente_id = n.cliente_id);
  if v_sub is null then
    raise exception using errcode = '22023', message = 'Esta conta não serve para esta nota (inativa, de outro cliente ou de outro tipo).';
  end if;
  v_chave := public._fn_produto_chave(i.codigo, i.descricao);
  if v_chave is null or nullif(n.emitente_documento, '') is null then
    raise exception using errcode = '22023', message = 'Este item não tem emitente, código nem descrição para virar regra.';
  end if;

  select * into r from public.financeiro_classificacao_regras
   where cliente_id = n.cliente_id and origem = 'item_da_nota' and ativo and cond_fornecedor = n.emitente_documento and cond_produto = v_chave
   for update;
  select pc.subcentro into v_sub_antes from public.financeiro_plano_contas pc where pc.id = r.plano_conta_id;
  v_acao := case when r.id is null then 'criar' when r.plano_conta_id = p_plano_conta_id then 'nada' else 'alterar' end;
  if p_simular or v_acao = 'nada' then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'acao', v_acao, 'regra_id', r.id, 'conta_antes', v_sub_antes, 'conta_depois', v_sub);
  end if;

  if v_acao = 'criar' then
    insert into public.financeiro_classificacao_regras (cliente_id, ativo, origem, cond_fornecedor, cond_produto, plano_conta_id, observacao_regra)
    values (n.cliente_id, true, 'item_da_nota', n.emitente_documento, v_chave, p_plano_conta_id,
            left('Item da nota ' || coalesce(n.numero, '?') || ': ' || i.descricao, 300))
    returning id into v_id;
  else
    update public.financeiro_classificacao_regras set plano_conta_id = p_plano_conta_id, updated_by = auth.uid(), updated_at = now()
     where id = r.id;
    v_id := r.id;
  end if;
  insert into public.produto_classificacao_trilha (via, objeto, chave, cliente_id, acao, antes, depois, motivo)
  select case when auth.uid() is null then 'sistema:' || coalesce(nullif(current_setting('app.via', true), ''), 'manutenção') end,
         'regra_item', v_id::text, n.cliente_id, v_acao, case when r.id is not null then to_jsonb(r) end, to_jsonb(x), btrim(p_motivo)
    from public.financeiro_classificacao_regras x where x.id = v_id;
  return jsonb_build_object('ok', true, 'simulado', false, 'acao', v_acao, 'regra_id', v_id, 'conta_antes', v_sub_antes, 'conta_depois', v_sub);
end $f$;

create function public.fn_item_regra_desfazer(p_regra_id uuid, p_motivo text, p_simular boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare r public.financeiro_classificacao_regras%rowtype;
begin
  select * into r from public.financeiro_classificacao_regras where id = p_regra_id and origem = 'item_da_nota' for update;
  if r.id is null or not coalesce(public.tenant_ok(r.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a esta regra.', detail = coalesce(p_regra_id::text, '');
  end if;
  if not r.ativo then raise exception using errcode = '22023', message = 'Esta regra já está desfeita.'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception using errcode = '22023', message = 'Diga o motivo de desfazer.'; end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'acao', 'desativar', 'regra_id', r.id); end if;
  update public.financeiro_classificacao_regras set ativo = false, updated_by = auth.uid(), updated_at = now() where id = r.id;
  insert into public.produto_classificacao_trilha (via, objeto, chave, cliente_id, acao, antes, depois, motivo)
  select case when auth.uid() is null then 'sistema:' || coalesce(nullif(current_setting('app.via', true), ''), 'manutenção') end,
         'regra_item', r.id::text, r.cliente_id, 'desativar', to_jsonb(r), to_jsonb(x), btrim(p_motivo)
    from public.financeiro_classificacao_regras x where x.id = r.id;
  return jsonb_build_object('ok', true, 'simulado', false, 'acao', 'desativar', 'regra_id', r.id);
end $f$;

-- ── 6. a tabela global se edita só pelo admin (prévia por padrão) ─────────────────────────────────────────────────────────────────────
create function public.fn_produto_ncm_familia_gravar(p_prefixo text, p_familia text, p_ativo boolean, p_motivo text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_antes public.produto_ncm_familia%rowtype; v_acao text;
begin
  if not public.is_admin_agroinblue((select auth.uid())) then
    raise exception using errcode = '42501', message = 'Só o admin do AGROinBLUE altera a tabela de NCM.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception using errcode = '22023', message = 'Diga o motivo.'; end if;
  select * into v_antes from public.produto_ncm_familia where prefixo = p_prefixo for update;
  v_acao := case when v_antes.prefixo is null then 'criar' when v_antes.ativo and not p_ativo then 'desativar'
                 when not v_antes.ativo and p_ativo then 'reativar' else 'alterar' end;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'acao', v_acao, 'antes', to_jsonb(v_antes)); end if;
  insert into public.produto_ncm_familia (prefixo, familia, ativo, atualizado_em, atualizado_por) values (p_prefixo, p_familia, p_ativo, now(), auth.uid())
  on conflict (prefixo) do update set familia = excluded.familia, ativo = excluded.ativo, atualizado_em = now(), atualizado_por = auth.uid();
  insert into public.produto_classificacao_trilha (objeto, chave, acao, antes, depois, motivo)
  select 'ncm_familia', p_prefixo, v_acao, case when v_antes.prefixo is not null then to_jsonb(v_antes) end, to_jsonb(f), btrim(p_motivo)
    from public.produto_ncm_familia f where f.prefixo = p_prefixo;
  return jsonb_build_object('ok', true, 'simulado', false, 'acao', v_acao);
end $f$;

create function public.fn_produto_familia_conta_gravar(p_familia text, p_escopo text, p_plano_conta_id uuid, p_ativo boolean, p_motivo text,
  p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_antes public.produto_familia_conta%rowtype; v_acao text;
begin
  if not public.is_admin_agroinblue((select auth.uid())) then
    raise exception using errcode = '42501', message = 'Só o admin do AGROinBLUE altera a tabela de famílias.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception using errcode = '22023', message = 'Diga o motivo.'; end if;
  select * into v_antes from public.produto_familia_conta where familia = p_familia and escopo_negocio = p_escopo for update;
  v_acao := case when v_antes.familia is null then 'criar' when v_antes.ativo and not p_ativo then 'desativar'
                 when not v_antes.ativo and p_ativo then 'reativar' else 'alterar' end;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'acao', v_acao, 'antes', to_jsonb(v_antes)); end if;
  insert into public.produto_familia_conta (familia, escopo_negocio, plano_conta_id, ativo, atualizado_em, atualizado_por)
  values (p_familia, p_escopo, p_plano_conta_id, p_ativo, now(), auth.uid())
  on conflict (familia, escopo_negocio) do update set plano_conta_id = excluded.plano_conta_id, ativo = excluded.ativo,
    atualizado_em = now(), atualizado_por = auth.uid();
  insert into public.produto_classificacao_trilha (objeto, chave, acao, antes, depois, motivo)
  select 'familia_conta', p_familia || '/' || p_escopo, v_acao, case when v_antes.familia is not null then to_jsonb(v_antes) end, to_jsonb(c), btrim(p_motivo)
    from public.produto_familia_conta c where c.familia = p_familia and c.escopo_negocio = p_escopo;
  return jsonb_build_object('ok', true, 'simulado', false, 'acao', v_acao);
end $f$;

-- funções nascem FECHADAS: as 5 da tela para authenticated; as internas para ninguém
revoke all on function public._fn_produto_trilha_imutavel(), public._fn_produto_familia_conta_guarda(),
  public._fn_nota_tipo_operacao(uuid, text), public._fn_produto_chave(text, text) from public, anon, authenticated;
revoke all on function public.fn_nota_itens_sugerir_conta(uuid), public.fn_item_regra_gravar(uuid, uuid, text, boolean),
  public.fn_item_regra_desfazer(uuid, text, boolean), public.fn_produto_ncm_familia_gravar(text, text, boolean, text, boolean),
  public.fn_produto_familia_conta_gravar(text, text, uuid, boolean, text, boolean) from public, anon;
grant execute on function public.fn_nota_itens_sugerir_conta(uuid), public.fn_item_regra_gravar(uuid, uuid, text, boolean),
  public.fn_item_regra_desfazer(uuid, text, boolean), public.fn_produto_ncm_familia_gravar(text, text, boolean, text, boolean),
  public.fn_produto_familia_conta_gravar(text, text, uuid, boolean, text, boolean) to authenticated;

-- ── 7. D6: o resolver dos importadores ignora as regras de item (patch guardado por md5) ──────────────────────────────────────────────
do $remendo$
declare
  v_def text;
  c_fn constant text := 'public.fn_classificacao_resolver_contexto(uuid,jsonb,boolean)';
  c_ancora constant text := E'  FROM public.financeiro_classificacao_regras r\n  WHERE r.ativo = true\n';
  c_novo constant text := E'  FROM public.financeiro_classificacao_regras r\n  WHERE r.ativo = true\n'
    || E'    AND r.origem IS DISTINCT FROM \'item_da_nota\' -- PLANO-SUGESTAO-01 D6: a regra de item da nota é da fn_nota_itens_sugerir_conta\n';
begin
  v_def := pg_get_functiondef(c_fn::regprocedure);
  if md5(v_def) <> 'e23ce1bcb020718fc6ca7d70e5800751' then
    raise exception 'PLANO-SUGESTAO-01: % mudou (md5 %). Nada foi gravado.', c_fn, md5(v_def);
  end if;
  if (length(v_def) - length(replace(v_def, c_ancora, ''))) / length(c_ancora) <> 1 then
    raise exception 'PLANO-SUGESTAO-01: a âncora do resolver não casa uma vez só. Nada foi gravado.';
  end if;
  execute replace(v_def, c_ancora, c_novo);
  if md5(pg_get_functiondef(c_fn::regprocedure)) <> '51da89a8bdcf8d2cb003d6f5e85a880a' then
    raise exception 'PLANO-SUGESTAO-01: o resolver depois do remendo tem md5 %. Nada foi gravado.', md5(pg_get_functiondef(c_fn::regprocedure));
  end if;
end $remendo$;

-- ── chegada ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
do $chegada$
declare v_t text; v_f text;
begin
  if (select count(*) from public.produto_ncm_familia) <> 33 or (select count(*) from public.produto_familia_conta) <> 22
     or (select count(*) from public.produto_classificacao_trilha) <> 55 then
    raise exception 'PLANO-SUGESTAO-01: a semente não confere. Nada foi gravado.';
  end if;
  foreach v_t in array array['public.produto_ncm_familia', 'public.produto_familia_conta', 'public.produto_classificacao_trilha'] loop
    if has_table_privilege('anon', v_t, 'select,insert,update,delete,truncate,references,trigger')
       or has_table_privilege('authenticated', v_t, 'insert,update,delete,truncate')
       or not has_table_privilege('authenticated', v_t, 'select')
       or not (select relrowsecurity from pg_class where oid = v_t::regclass) then
      raise exception 'PLANO-SUGESTAO-01: privilégio ou RLS de % não confere. Nada foi gravado.', v_t;
    end if;
  end loop;
  foreach v_f in array array['public.fn_nota_itens_sugerir_conta(uuid)', 'public.fn_item_regra_gravar(uuid,uuid,text,boolean)',
    'public.fn_item_regra_desfazer(uuid,text,boolean)', 'public.fn_produto_ncm_familia_gravar(text,text,boolean,text,boolean)',
    'public.fn_produto_familia_conta_gravar(text,text,uuid,boolean,text,boolean)'] loop
    if has_function_privilege('anon', v_f, 'execute') or not has_function_privilege('authenticated', v_f, 'execute') then
      raise exception 'PLANO-SUGESTAO-01: execução de % não confere. Nada foi gravado.', v_f;
    end if;
  end loop;
  foreach v_f in array array['public._fn_nota_tipo_operacao(uuid,text)', 'public._fn_produto_chave(text,text)'] loop
    if has_function_privilege('anon', v_f, 'execute') or has_function_privilege('authenticated', v_f, 'execute') then
      raise exception 'PLANO-SUGESTAO-01: % segue aberta. Nada foi gravado.', v_f;
    end if;
  end loop;
  if (select count(*) from public.financeiro_classificacao_regras where origem = 'item_da_nota') <> 0 then
    raise exception 'PLANO-SUGESTAO-01: já existe regra de item. Nada foi gravado.';
  end if;
end $chegada$;
